import { createClient } from '@/lib/supabase/server'
import { logQueryError } from '@/lib/supabase/logError'

export interface FeedRow {
  id: string
  url: string
  title: string
  category: string | null
  last_fetched_at: string | null
  last_error: string | null
  is_scraped: boolean
  summarize_articles: boolean
  consecutive_failures: number
  folderIds: string[]
}

export async function listFeedsDetailed(): Promise<FeedRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('feeds')
    .select(
      'id, url, title, category, last_fetched_at, last_error, is_scraped, summarize_articles, consecutive_failures'
    )
    .order('title')
  logQueryError('feeds/listFeedsDetailed', error)
  const feeds = data ?? []
  if (feeds.length === 0) return []

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

  return feeds.map((feed) => ({ ...feed, folderIds: foldersByFeed.get(feed.id) ?? [] }))
}
