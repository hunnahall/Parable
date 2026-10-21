import { createClient, getUser } from '@/lib/supabase/server'
import { logQueryError } from '@/lib/supabase/logError'

// How many articles the user has saved, for the Saved page's header
// figure. The list itself is paginated, so it can't count them.
export async function countSavedArticles(): Promise<number> {
  const user = await getUser()
  if (!user) return 0

  const supabase = await createClient()
  const { count, error } = await supabase
    .from('article_states')
    .select('feed_item_id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('state', 'saved')
  logQueryError('articles/countSavedArticles', error)
  return count ?? 0
}
