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
  'id, url, title, category, last_fetched_at, last_error, is_scraped, summarize_articles, consecutive_failures'

export async function addFeed(input: {
  url: string
  title: string
  category: string | null
  summarizeArticles?: boolean
}): Promise<{ feed: FeedRow; error: null } | { feed: null; error: string }> {
  const user = await getUser()
  if (!user) return { feed: null, error: 'Not signed in' }

  const url = input.url.trim()
  let title = input.title.trim()
  const category = input.category?.trim() || null

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
  const { data, error } = await supabase
    .from('feeds')
    .insert({ url, title, category, summarize_articles: input.summarizeArticles ?? false })
    .select(FEED_SELECT)
    .single()

  if (error || !data) return { feed: null, error: error?.message ?? 'Insert failed' }

  revalidatePath('/feeds')
  return { feed: { ...data, folderIds: [] }, error: null }
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
  category: string | null
  summarizeArticles?: boolean
}): Promise<{ feed: FeedRow; error: null } | { feed: null; error: string }> {
  const user = await getUser()
  if (!user) return { feed: null, error: 'Not signed in' }

  const url = input.sourceUrl.trim()
  const title = input.title.trim()
  const category = input.category?.trim() || null

  if (!url) return { feed: null, error: 'URL is required' }
  if (!title) return { feed: null, error: 'Title is required' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('feeds')
    .insert({
      url,
      title,
      category,
      is_scraped: true,
      summarize_articles: input.summarizeArticles ?? false,
    })
    .select(FEED_SELECT)
    .single()

  if (error || !data) return { feed: null, error: error?.message ?? 'Insert failed' }

  revalidatePath('/feeds')
  return { feed: { ...data, folderIds: [] }, error: null }
}

// Manual trigger, unlike the cron-driven /api/ingest-feeds route: capped
// to the last 24 hours so clicking this on a feed that's never been
// ingested doesn't backfill its entire history in one go.
export async function runIngestNow(): Promise<
  { summary: IngestSummary; error: null } | { summary: null; error: string }
> {
  const user = await getUser()
  if (!user) return { summary: null, error: 'Not signed in' }

  try {
    const summary = await runIngest({ maxAgeHours: 24 })
    revalidatePath('/feeds')
    revalidatePath('/')
    return { summary, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { summary: null, error: message }
  }
}

export async function updateFeed(
  id: string,
  input: { title: string; category: string | null }
): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const title = input.title.trim()
  const category = input.category?.trim() || null

  if (!title) return { error: 'Title is required' }

  const supabase = await createClient()
  const { error } = await supabase.from('feeds').update({ title, category }).eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/feeds')
  return { error: null }
}

// Toggled directly from the feed list (see FeedManager.tsx) — deliberately
// its own action rather than folded into updateFeed, since it fires on a
// single click with no Edit-mode round trip and shouldn't need the
// title/category validation that comes with a full feed edit.
export async function setFeedSummarizeArticles(
  id: string,
  enabled: boolean
): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('feeds')
    .update({ summarize_articles: enabled })
    .eq('id', id)

  if (error) return { error: error.message }

  // Toggling off: clear stale AI summaries so the DB itself reflects "no
  // AI summary" rather than relying purely on the read-time gate in
  // bestSummary() (src/lib/dashboard/data.ts) to hide a value that's
  // still sitting there. Narrow, deliberate exception to retention.ts's
  // "summary_ai is kept forever" policy — scoped to exactly this field,
  // triggered by exactly the user action that should invalidate it.
  // Best-effort: a failure here doesn't fail the toggle itself, since the
  // read-time gate already makes the bug invisible regardless.
  if (!enabled) {
    const { error: clearError } = await supabase
      .from('feed_items')
      .update({ summary_ai: null })
      .eq('feed_id', id)
    logQueryError('feeds/setFeedSummarizeArticles (clear summary_ai)', clearError)
  }

  revalidatePath('/feeds')
  return { error: null }
}

export async function removeFeed(id: string): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const supabase = await createClient()

  // Delete dependent feed_items explicitly rather than relying on an
  // assumed ON DELETE CASCADE on the feed_items.feed_id FK, since this
  // repo has no schema file to confirm that constraint exists.
  const { error: itemsError } = await supabase.from('feed_items').delete().eq('feed_id', id)
  if (itemsError) return { error: itemsError.message }

  const { error } = await supabase.from('feeds').delete().eq('id', id)
  if (error) return { error: error.message }

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
