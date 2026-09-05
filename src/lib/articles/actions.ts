'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getUser } from '@/lib/supabase/server'
import { getArticlesPage, type ArticlesPageFilters, type ArticlesPageResult } from '@/lib/articles/list'
import { setArticleFolders } from '@/lib/folders/actions'

// 'deleted' is a per-user tombstone, not a state the UI offers as a
// destination: it hides the article from every one of this user's views
// without touching the shared feed_items row other subscribers read.
export type ArticleCuration = 'saved' | 'archived' | 'deleted'

// Thin server-action wrapper around getArticlesPage — the Inbox page's
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

  // Archiving takes an article out of every folder it was filed under —
  // Save membership is derived from folder membership, so an archived
  // article can't still read as saved.
  if (state === 'archived') {
    const { error: folderError } = await setArticleFolders(feedItemId, [])
    if (folderError) console.error(`articles/setState: clear folders for ${feedItemId}`, folderError)
  }

  revalidatePath('/')
  return { error: null }
}

export async function saveArticle(feedItemId: string) {
  return setState(feedItemId, 'saved')
}

// Manual archive from the Inbox. An archived article is kept for a
// further 24h before retention deletes it (see src/lib/feeds/retention.ts).
export async function archiveArticle(feedItemId: string) {
  return setState(feedItemId, 'archived')
}

// Returns an article to its neutral/unfiled state — neither saved nor
// archived, so it reappears in the Inbox (until it ages past the 12h
// retention window, at which point the next sweep deletes it).
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

// Un-saves an article, returning it to the Inbox — same underlying delete
// as clearArticleState. Distinct from purgeArticles below, which removes
// it from every view for good.
export async function deleteArticle(feedItemId: string): Promise<{ error: string | null }> {
  return clearArticleState(feedItemId)
}

// Bulk version of archiveArticle — one upsert instead of N sequential
// ones, for the Inbox/Save pages' multi-select toolbar (not shown on
// Archive, where every item is already archived — see ArticlesView).
export async function archiveArticlesBulk(
  feedItemIds: string[]
): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }
  if (feedItemIds.length === 0) return { error: null }

  const supabase = await createClient()
  const now = new Date().toISOString()
  const { error } = await supabase.from('article_states').upsert(
    feedItemIds.map((feedItemId) => ({
      user_id: user.id,
      feed_item_id: feedItemId,
      state: 'archived' as const,
      archived_at: now,
    })),
    { onConflict: 'user_id,feed_item_id' }
  )
  if (error) return { error: error.message }

  // Bulk equivalent of setState's single-item setArticleFolders(id, []) —
  // a loop over N ids would be N round trips for what's already a
  // few-rows-per-id delete.
  const { error: folderError } = await supabase
    .from('article_folders')
    .delete()
    .eq('user_id', user.id)
    .in('feed_item_id', feedItemIds)
  if (folderError) console.error('articles/archiveArticlesBulk: clear folders', folderError)

  revalidatePath('/')
  return { error: null }
}

// The bulk toolbar's Delete (see ArticlesView's confirm-to-delete step).
// Unlike deleteArticle/clearArticleState above, which return an article to
// the Inbox by dropping its curation row, this removes it from every one
// of this user's views for good.
//
// It marks a 'deleted' state rather than deleting the feed_items row: that
// row is shared by every subscriber to the feed, so hard-deleting it here
// would destroy other people's copies — saved ones included — from one
// click. archived_at is stamped so retention can reclaim the shared row
// once nobody wants it (see reclaim_orphaned_feed_items).
export async function purgeArticles(feedItemIds: string[]): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }
  if (feedItemIds.length === 0) return { error: null }

  const now = new Date().toISOString()
  const supabase = await createClient()
  const { error } = await supabase.from('article_states').upsert(
    feedItemIds.map((feedItemId) => ({
      user_id: user.id,
      feed_item_id: feedItemId,
      state: 'deleted' as const,
      archived_at: now,
      note: null,
    })),
    { onConflict: 'user_id,feed_item_id' }
  )
  if (error) return { error: error.message }

  revalidatePath('/')
  return { error: null }
}

// Display-only read tracking, fired when a card's title is clicked
// through to the publisher — must never touch article_states/archived_at,
// since read state is explicitly independent of the retention timers.
// Feeds' 7-day engagement rate is the only consumer.
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

// Notes only make sense once an article has a curation row (Save or
// Archive — its NOT NULL `state` column has to already exist), so this
// updates rather than upserts; the UI only ever calls it for filed items.
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
