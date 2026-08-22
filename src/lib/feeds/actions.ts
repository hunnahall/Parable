'use server'

import { revalidatePath } from 'next/cache'
import Parser from 'rss-parser'
import { createClient, getUser } from '@/lib/supabase/server'
import { runIngest, type IngestSummary } from './ingest'
import type { FeedRow } from './data'

const FEED_TITLE_FETCH_TIMEOUT_MS = 15_000

export async function addFeed(input: {
  url: string
  title: string
  category: string | null
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
    .insert({ url, title, category })
    .select('id, url, title, category, last_fetched_at, last_error')
    .single()

  if (error || !data) return { feed: null, error: error?.message ?? 'Insert failed' }

  revalidatePath('/feeds')
  return { feed: { ...data, folderIds: [] }, error: null }
}

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
