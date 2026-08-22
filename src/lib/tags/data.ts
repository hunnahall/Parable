import { createClient, getUser } from '@/lib/supabase/server'
import { logQueryError } from '@/lib/supabase/logError'

export interface TagCount {
  tag: string
  count: number
}

// Distinct tags across ALL of a user's article_states rows — saved and
// archived alike — superseding the old listSavedTags, which only looked at
// saved articles. Personal-scale data, so "fetch and dedupe in JS" is fine.
export async function listAllTags(): Promise<TagCount[]> {
  const user = await getUser()
  if (!user) return []

  const supabase = await createClient()
  const { data, error } = await supabase.from('article_states').select('tags').eq('user_id', user.id)
  logQueryError('tags/listAllTags', error)

  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    for (const tag of row.tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => a.tag.localeCompare(b.tag))
}
