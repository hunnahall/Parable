import { createClient, getUser } from '@/lib/supabase/server'
import { logQueryError } from '@/lib/supabase/logError'

export interface FeedNumbers {
  // Articles the feed delivered per day over the window.
  perDay: number
  // Share of those articles the reader opened, or null with none to open.
  openedRate: number | null
}

// Per-feed numbers for the Feeds page, from running daily counts that
// survive article deletion (see the feed_numbers migration). The window
// is the last 7 days, shorter for a feed subscribed since or counted only
// since 2026-10-21.
export async function getFeedNumbers(): Promise<Map<string, FeedNumbers>> {
  const user = await getUser()
  if (!user) return new Map()

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('feed_numbers')
  logQueryError('feeds/getFeedNumbers', error)

  const result = new Map<string, FeedNumbers>()
  for (const row of (data ?? []) as { feed_id: string; articles: number; opens: number; days: number }[]) {
    const articles = Number(row.articles)
    const opens = Number(row.opens)
    result.set(row.feed_id, {
      perDay: articles / Number(row.days),
      openedRate: articles > 0 ? Math.min(opens / articles, 1) : null,
    })
  }
  return result
}
