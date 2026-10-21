import { createClient, getUser } from '@/lib/supabase/server'
import { logQueryError } from '@/lib/supabase/logError'

export interface FilteredTitle {
  id: string
  title: string
  link: string | null
  keyword: string
  feedTitle: string | null
  filteredAt: string
}

// The last 36 hours of titles the reader's filters removed, newest first.
// The Inbox narrows this to "today" in the reader's own time zone, which
// only the browser knows.
export async function listRecentFilteredTitles(): Promise<FilteredTitle[]> {
  const user = await getUser()
  if (!user) return []

  const supabase = await createClient()
  const since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('filtered_titles')
    .select('id, title, link, keyword, filtered_at, feed_id, feeds(title)')
    .eq('user_id', user.id)
    .gte('filtered_at', since)
    .order('filtered_at', { ascending: false })
    .limit(500)
  logQueryError('filters/listRecentFilteredTitles', error)

  return (data ?? []).map((row) => {
    const feed = row.feeds as unknown as { title: string | null } | null
    return {
      id: row.id,
      title: row.title,
      link: row.link,
      keyword: row.keyword,
      feedTitle: feed?.title ?? null,
      filteredAt: row.filtered_at,
    }
  })
}
