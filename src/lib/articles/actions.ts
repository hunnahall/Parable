'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getUser } from '@/lib/supabase/server'
import { getArticlesPage, type ArticlesPageFilters, type ArticlesPageResult } from '@/lib/dashboard/data'

export type ArticleCuration = 'saved' | 'archived'

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
  const { error } = await supabase.from('article_states').upsert(
    {
      user_id: user.id,
      feed_item_id: feedItemId,
      state,
      archived_at: state === 'archived' ? new Date().toISOString() : null,
    },
    { onConflict: 'user_id,feed_item_id' }
  )

  if (error) return { error: error.message }

  revalidatePath('/')
  return { error: null }
}

export async function saveArticle(feedItemId: string) {
  return setState(feedItemId, 'saved')
}

// Manual archive — replaces the old "Ignore" action. Same effect as the
// 48h auto-archive cron sweep (see src/lib/feeds/retention.ts), just
// triggered immediately by the user instead of by elapsed time.
export async function archiveArticle(feedItemId: string) {
  return setState(feedItemId, 'archived')
}

// Returns an article to its neutral/unfiled state — neither saved nor
// archived, so it reappears on the Articles page (or, if 48h have already
// passed since publish, gets swept back into Archive by the next cron run).
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

// Permanently deletes an article's curation row (used from the Saved page's
// "Delete" action) — same underlying delete as clearArticleState, exposed
// under a name that matches what it means from Saved (removing it from
// your library entirely), not "un-saving back to Articles."
export async function deleteArticle(feedItemId: string): Promise<{ error: string | null }> {
  return clearArticleState(feedItemId)
}

// Display-only read tracking (see src/app/articles/[id]/page.tsx) — must
// never touch article_states/archived_at, since read state is explicitly
// independent of the 48h auto-archive timer.
export async function markArticleRead(feedItemId: string): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('read_items')
    .upsert(
      { user_id: user.id, feed_item_id: feedItemId },
      { onConflict: 'user_id,feed_item_id', ignoreDuplicates: true }
    )

  if (error) return { error: error.message }
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
