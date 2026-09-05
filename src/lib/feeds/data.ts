import { createClient, getUser } from '@/lib/supabase/server'
import { logQueryError } from '@/lib/supabase/logError'

export interface FeedRow {
  id: string
  url: string
  title: string
  last_fetched_at: string | null
  last_error: string | null
  is_scraped: boolean
  consecutive_failures: number
  folderIds: string[]
}

// The feeds table is a shared catalog — one row per URL, fetched once for
// everyone who subscribes — so what a user sees is the intersection of it
// with their own subscriptions: their title override (falling back to the
// catalog's), their AI-summary choice, their folder filing.
export async function listFeedsDetailed(): Promise<FeedRow[]> {
  const user = await getUser()
  if (!user) return []

  const supabase = await createClient()
  const { data: subs, error: subsError } = await supabase
    .from('subscriptions')
    .select('feed_id, title')
    .eq('user_id', user.id)
  logQueryError('feeds/listFeedsDetailed (subscriptions)', subsError)

  const subscriptions = subs ?? []
  if (subscriptions.length === 0) return []

  const feedIds = subscriptions.map((sub) => sub.feed_id)
  const { data, error } = await supabase
    .from('feeds')
    .select('id, url, title, last_fetched_at, last_error, is_scraped, consecutive_failures')
    .in('id', feedIds)
    .is('deleted_at', null)
    .order('title')
  logQueryError('feeds/listFeedsDetailed', error)
  const feeds = data ?? []
  if (feeds.length === 0) return []

  const subByFeed = new Map(subscriptions.map((sub) => [sub.feed_id, sub]))

  const { data: feedFolders, error: feedFoldersError } = await supabase
    .from('feed_folders')
    .select('feed_id, folder_id')
    .in(
      'feed_id',
      feeds.map((f) => f.id)
    )
  logQueryError('feeds/listFeedsDetailed (folders)', feedFoldersError)

  const foldersByFeed = new Map<string, string[]>()
  for (const row of feedFolders ?? []) {
    const list = foldersByFeed.get(row.feed_id) ?? []
    list.push(row.folder_id)
    foldersByFeed.set(row.feed_id, list)
  }

  return feeds.map((feed) => {
    const sub = subByFeed.get(feed.id)
    return {
      ...feed,
      title: sub?.title ?? feed.title,
      folderIds: foldersByFeed.get(feed.id) ?? [],
    }
  })
}
