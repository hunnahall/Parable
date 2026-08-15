import { createClient } from '@/lib/supabase/server'

export interface FeedRow {
  id: string
  url: string
  title: string
  category: string | null
  last_fetched_at: string | null
}

export async function listFeedsDetailed(): Promise<FeedRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('feeds')
    .select('id, url, title, category, last_fetched_at')
    .order('title')
  return data ?? []
}
