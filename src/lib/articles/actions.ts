'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getUser } from '@/lib/supabase/server'

export type ArticleCuration = 'saved' | 'ignored'

async function setState(
  feedItemId: string,
  state: ArticleCuration
): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('article_states')
    .upsert(
      { user_id: user.id, feed_item_id: feedItemId, state },
      { onConflict: 'user_id,feed_item_id' }
    )

  if (error) return { error: error.message }

  revalidatePath('/')
  return { error: null }
}

export async function saveArticle(feedItemId: string) {
  return setState(feedItemId, 'saved')
}

export async function ignoreArticle(feedItemId: string) {
  return setState(feedItemId, 'ignored')
}

// Returns an article to its neutral state — neither saved nor ignored.
export async function clearArticleState(feedItemId: string): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('article_states')
    .delete()
    .eq('user_id', user.id)
    .eq('feed_item_id', feedItemId)

  if (error) return { error: error.message }

  revalidatePath('/')
  return { error: null }
}
