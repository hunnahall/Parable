import { createClient, getUser } from '@/lib/supabase/server'
import { logQueryError } from '@/lib/supabase/logError'

export interface EngagementRate {
  produced7d: number
  read7d: number
  rate: number | null
}

// Rolling 7-day (reads / produced) per feed, recomputed live on every
// Manage Feeds page load — this app's data volume (dozens of feeds/items)
// makes a materialized view unnecessary.
export async function getEngagementRates(): Promise<Map<string, EngagementRate>> {
  const user = await getUser()
  if (!user) return new Map()

  const supabase = await createClient()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: items, error: itemsError } = await supabase
    .from('feed_items')
    .select('id, feed_id')
    .gte('published_at', sevenDaysAgo)
  logQueryError('feeds/getEngagementRates (items)', itemsError)

  const produced = new Map<string, number>()
  const feedIdByItemId = new Map<string, string>()
  for (const item of items ?? []) {
    produced.set(item.feed_id, (produced.get(item.feed_id) ?? 0) + 1)
    feedIdByItemId.set(item.id, item.feed_id)
  }

  const itemIds = [...feedIdByItemId.keys()]
  const read = new Map<string, number>()
  if (itemIds.length > 0) {
    const { data: readRows, error: readError } = await supabase
      .from('read_items')
      .select('feed_item_id')
      .eq('user_id', user.id)
      .in('feed_item_id', itemIds)
    logQueryError('feeds/getEngagementRates (reads)', readError)

    for (const row of readRows ?? []) {
      const feedId = feedIdByItemId.get(row.feed_item_id)
      if (feedId) read.set(feedId, (read.get(feedId) ?? 0) + 1)
    }
  }

  const result = new Map<string, EngagementRate>()
  for (const feedId of produced.keys()) {
    const produced7d = produced.get(feedId) ?? 0
    const read7d = read.get(feedId) ?? 0
    result.set(feedId, { produced7d, read7d, rate: produced7d > 0 ? read7d / produced7d : null })
  }
  return result
}
