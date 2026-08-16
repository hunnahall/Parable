import { createClient } from '@/lib/supabase/server'
import { logQueryError } from '@/lib/supabase/logError'

export interface FeedRow {
  id: string
  url: string
  title: string
  category: string | null
  last_fetched_at: string | null
  last_error: string | null
}

export async function listFeedsDetailed(): Promise<FeedRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('feeds')
    .select('id, url, title, category, last_fetched_at, last_error')
    .order('title')
  logQueryError('feeds/listFeedsDetailed', error)
  return data ?? []
}
