'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getUser } from '@/lib/supabase/server'
import { getArticlesPage, type ArticlesPageFilters, type ArticlesPageResult } from '@/lib/dashboard/data'

export type ArticleCuration = 'saved' | 'ignored'

// Thin server-action wrapper around getArticlesPage — the Articles page's
// client component (for "Load more") can't call data.ts functions
// directly, since createClient() there needs a Server Component/Route
// Handler/Server Action context.
export async function fetchArticlesPage(filters: ArticlesPageFilters): Promise<ArticlesPageResult> {
  return getArticlesPage(filters)
}

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

// Notes/tags only make sense once an article has been saved (the row —
// and its NOT NULL `state` column — has to already exist), so these
// update rather than upsert; the UI only ever calls them for saved items.
export async function setArticleNote(
  feedItemId: string,
  note: string
): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('article_states')
    .update({ note: note.trim() || null })
    .eq('user_id', user.id)
    .eq('feed_item_id', feedItemId)

  if (error) return { error: error.message }

  revalidatePath('/')
  return { error: null }
}

export async function setArticleTags(
  feedItemId: string,
  tags: string[]
): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const normalized = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))]

  const supabase = await createClient()
  const { error } = await supabase
    .from('article_states')
    .update({ tags: normalized })
    .eq('user_id', user.id)
    .eq('feed_item_id', feedItemId)

  if (error) return { error: error.message }

  revalidatePath('/')
  return { error: null }
}
