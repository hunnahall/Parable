'use server'

import { revalidatePath } from 'next/cache'
import Parser from 'rss-parser'
import { createClient, getUser } from '@/lib/supabase/server'
import { logQueryError } from '@/lib/supabase/logError'
import { runIngest, type IngestSummary } from './ingest'
import { generateFeedsOpml } from './opmlExport'
import { detectArticles, type BuildFeedPreview } from './buildFeed'
import type { FeedRow } from './data'

const FEED_TITLE_FETCH_TIMEOUT_MS = 15_000

const FEED_SELECT =
  'id, url, title, last_fetched_at, last_error, is_scraped, consecutive_failures'

// feeds is a shared catalog keyed by url: two users adding the same feed
// get the same row, so it's only ever fetched and stored once. Subscribing
// is what makes it appear in *your* list.
async function subscribeToFeed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  feedId: string,
  options: { title: string }
): Promise<string | null> {
  const { error } = await supabase.from('subscriptions').upsert(
    {
      user_id: userId,
      feed_id: feedId,
      title: options.title,
    },
    { onConflict: 'user_id,feed_id' }
  )
  return error?.message ?? null
}

export async function addFeed(input: {
  url: string
  title: string
}): Promise<{ feed: FeedRow; error: null } | { feed: null; error: string }> {
  const user = await getUser()
  if (!user) return { feed: null, error: 'Not signed in' }

  const url = input.url.trim()
  let title = input.title.trim()

  if (!url) return { feed: null, error: 'URL is required' }

  if (!title) {
    // Title left blank — try to detect it from the feed itself rather
    // than forcing the user to know it upfront.
    try {
      const parser = new Parser({ timeout: FEED_TITLE_FETCH_TIMEOUT_MS })
      const parsed = await parser.parseURL(url)
      title = parsed.title?.trim() ?? ''
    } catch {
      // Fall through — reported as a normal validation error below.
    }
    if (!title) {
      return {
        feed: null,
        error: "Couldn't detect a title from that feed — please enter one manually.",
      }
    }
  }

  const supabase = await createClient()
  // Reuse the catalog row if this URL is already known (another user's
  // subscription, or one you previously removed), rather than creating a
  // duplicate that would be fetched and stored twice.
  const { data: existing, error: lookupError } = await supabase
    .from('feeds')
    .select(FEED_SELECT)
    .eq('url', url)
    .maybeSingle()
  if (lookupError) return { feed: null, error: lookupError.message }

  let feed = existing
  if (!feed) {
    const { data, error } = await supabase
      .from('feeds')
      .insert({ url, title })
      .select(FEED_SELECT)
      .single()
    if (error || !data) return { feed: null, error: error?.message ?? 'Insert failed' }
    feed = data
  }

  const subscribeError = await subscribeToFeed(supabase, user.id, feed.id, {
    title,
  })
  if (subscribeError) return { feed: null, error: subscribeError }

  revalidatePath('/feeds')
  return { feed: { ...feed, title, folderIds: [] }, error: null }
}

// Step 1 of "Build a Feed" (see BuildFeedSection.tsx): fetches and
// heuristically parses `url`'s repeating article pattern (see
// src/lib/feeds/buildFeed.ts) without saving anything, so the UI can show
// what was found and let the user back out before committing to it.
export async function previewBuiltFeed(
  url: string
): Promise<{ preview: BuildFeedPreview; error: null } | { preview: null; error: string }> {
  const user = await getUser()
  if (!user) return { preview: null, error: 'Not signed in' }

  const trimmed = url.trim()
  if (!trimmed) return { preview: null, error: 'URL is required' }

  return detectArticles(trimmed)
}

// Step 2: saves a feed whose "url" is the page to be re-scraped on every
// ingest, not an RSS/Atom URL — is_scraped is what tells runIngest (see
// src/lib/feeds/ingest.ts) to route it through detectArticles instead of
// rss-parser.
export async function createBuiltFeed(input: {
  sourceUrl: string
  title: string
}): Promise<{ feed: FeedRow; error: null } | { feed: null; error: string }> {
  const user = await getUser()
  if (!user) return { feed: null, error: 'Not signed in' }

  const url = input.sourceUrl.trim()
  const title = input.title.trim()

  if (!url) return { feed: null, error: 'URL is required' }
  if (!title) return { feed: null, error: 'Title is required' }

  const supabase = await createClient()
  const { data: existing, error: lookupError } = await supabase
    .from('feeds')
    .select(FEED_SELECT)
    .eq('url', url)
    .maybeSingle()
  if (lookupError) return { feed: null, error: lookupError.message }

  let feed = existing
  if (!feed) {
    const { data, error } = await supabase
      .from('feeds')
      .insert({ url, title, is_scraped: true })
      .select(FEED_SELECT)
      .single()
    if (error || !data) return { feed: null, error: error?.message ?? 'Insert failed' }
    feed = data
  }

  const subscribeError = await subscribeToFeed(supabase, user.id, feed.id, {
    title,
  })
  if (subscribeError) return { feed: null, error: subscribeError }

  revalidatePath('/feeds')
  return { feed: { ...feed, title, folderIds: [] }, error: null }
}

// Manual trigger, unlike the cron-driven /api/ingest-feeds route — same
// underlying runIngest, including its 24h cutoff, so clicking this on a
// feed that's never been ingested doesn't backfill its entire history.
export async function runIngestNow(): Promise<
  { summary: IngestSummary; error: null } | { summary: null; error: string }
> {
  const user = await getUser()
  if (!user) return { summary: null, error: 'Not signed in' }

  try {
    const summary = await runIngest()
    revalidatePath('/feeds')
    revalidatePath('/')
    return { summary, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { summary: null, error: message }
  }
}

// Renames the feed for you only. The title lives on your subscription
// rather than the shared catalog row, so this can't rename another
// subscriber's copy out from under them.
export async function updateFeed(
  id: string,
  input: { title: string }
): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const title = input.title.trim()
  if (!title) return { error: 'Title is required' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('subscriptions')
    .update({ title })
    .eq('user_id', user.id)
    .eq('feed_id', id)

  if (error) return { error: error.message }

  revalidatePath('/feeds')
  return { error: null }
}

// Unsubscribing, not deleting. The feed and its articles are shared, so
// tearing down the catalog row would take other subscribers' articles —
// including saved ones — with it. Dropping the subscription removes the
// feed from your list and stops it counting toward your inbox, while
// anything you saved from it stays readable (both the feed_items policy
// and feed_items_excluding_states keep articles you've curated visible
// after the subscription is gone).
//
// A feed nobody subscribes to any more is soft-deleted so ingest stops
// fetching it; the row itself survives to keep those saved articles' FK
// intact and to be reused if someone adds the same URL again.
export async function removeFeed(id: string): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const supabase = await createClient()

  const { error: unsubscribeError } = await supabase
    .from('subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('feed_id', id)
  if (unsubscribeError) return { error: unsubscribeError.message }

  // Your folder filing for this feed goes with the subscription; other
  // subscribers' filing lives in their own folders, which this can't see.
  const { error: folderError } = await supabase
    .from('feed_folders')
    .delete()
    .eq('feed_id', id)
  logQueryError('feeds/removeFeed (folder cleanup)', folderError)

  const { count, error: countError } = await supabase
    .from('subscriptions')
    .select('feed_id', { count: 'exact', head: true })
    .eq('feed_id', id)
  if (countError) return { error: countError.message }

  if ((count ?? 0) === 0) {
    const { error } = await supabase
      .from('feeds')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return { error: error.message }
  }

  revalidatePath('/feeds')
  revalidatePath('/')
  return { error: null }
}

export async function exportFeedsOpml(): Promise<{ opml: string | null; error: string | null }> {
  const user = await getUser()
  if (!user) return { opml: null, error: 'Not signed in' }

  const opml = await generateFeedsOpml()
  return { opml, error: null }
}
