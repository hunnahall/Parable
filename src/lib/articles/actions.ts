'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { createClient, getUser } from '@/lib/supabase/server'
import { getArticlesPage, type ArticlesPageFilters, type ArticlesPageResult } from '@/lib/articles/list'
import { getUserPreferences } from '@/lib/preferences/data'
import { mapWithConcurrency } from '@/lib/concurrency'
import { assignArticleToFolder } from '@/lib/folders/actions'
import {
  checkArticleContentCache,
  fetchAndPersistArticleContent,
  ensureArticleContentTranslated,
} from '@/lib/articles/content'

// Bounded, same spirit as ingest.ts's PREWARM_CONCURRENCY — moveToReader's
// background job below is a live scrape (+ possibly a translate call) per
// item, so a large bulk "Read" selection shouldn't hammer several hosts
// (or OpenAI) all at once.
const READER_TRANSLATE_CONCURRENCY = 3

export type ArticleCuration = 'saved' | 'archived' | 'reading'

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
      // Archiving takes an article out of every folder/tag it was filed
      // under — Save membership is derived from having a folder and/or a
      // tag, so an archived article can't still read as saved.
      ...(state === 'archived' ? { tags: [] } : {}),
    },
    { onConflict: 'user_id,feed_item_id' }
  )

  if (error) return { error: error.message }

  if (state === 'archived') {
    const { error: folderError } = await assignArticleToFolder(feedItemId, null)
    if (folderError) console.error(`articles/setState: clear folder for ${feedItemId}`, folderError)
  }

  revalidatePath('/')
  return { error: null }
}

export async function saveArticle(feedItemId: string) {
  return setState(feedItemId, 'saved')
}

// Manual archive — replaces the old "Ignore" action. Same effect as the
// 24h auto-archive cron sweep (see src/lib/feeds/retention.ts), just
// triggered immediately by the user instead of by elapsed time.
export async function archiveArticle(feedItemId: string) {
  return setState(feedItemId, 'archived')
}

// Returns an article to its neutral/unfiled state — neither saved nor
// archived, so it reappears on the Articles page (or, if 24h have already
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

// Permanently deletes an article's curation row (used from the Save page's
// "Delete" action) — same underlying delete as clearArticleState, exposed
// under a name that matches what it means from Save (removing it from
// your library entirely), not "un-saving back to Articles."
export async function deleteArticle(feedItemId: string): Promise<{ error: string | null }> {
  return clearArticleState(feedItemId)
}

// Moves one or more Inbox articles to Read — the bulk "Read" toolbar
// button and each card's "Read" button both call this (with one or many
// ids). Full-body translation is fetched eagerly in the background right
// after the state upsert (not awaited — this action returns as soon as the
// upsert succeeds), reusing the exact same scrape/translate chain the
// reading view's lazy on-open path uses (see ensureArticleContentTranslated
// in src/lib/articles/content.ts), so an article opened on the Read page
// usually already has its translated body cached instead of paying for the
// scrape+translate live.
export async function moveToReader(feedItemIds: string[]): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }
  if (feedItemIds.length === 0) return { error: null }

  const supabase = await createClient()
  const { error } = await supabase.from('article_states').upsert(
    feedItemIds.map((feedItemId) => ({
      user_id: user.id,
      feed_item_id: feedItemId,
      state: 'reading' as const,
      archived_at: null,
    })),
    { onConflict: 'user_id,feed_item_id' }
  )
  if (error) return { error: error.message }

  // Resolved up front rather than inside the deferred after() callback —
  // each item's link/original_language and the user's target language are
  // all this job needs, and after() runs post-response, so there's
  // nothing left to gain by deferring these reads too.
  const [{ data: items }, prefs] = await Promise.all([
    supabase.from('feed_items').select('id, link, original_language').in('id', feedItemIds),
    getUserPreferences(),
  ])
  const targetLanguage = prefs.language

  after(() =>
    mapWithConcurrency(items ?? [], READER_TRANSLATE_CONCURRENCY, async (item) => {
      if (!item.link) return
      try {
        const cacheCheck = await checkArticleContentCache(item.id)
        const content = cacheCheck.hit
          ? cacheCheck.content
          : await fetchAndPersistArticleContent(item.id, item.link, cacheCheck.attemptCount, supabase)
        await ensureArticleContentTranslated(item.id, content, item.original_language, targetLanguage)
      } catch (err) {
        console.error(`articles/moveToReader: feed_item ${item.id}`, err)
      }
    })
  )

  revalidatePath('/inbox')
  revalidatePath('/read')
  return { error: null }
}

// Bulk version of archiveArticle — one upsert instead of N sequential
// ones, for the Articles/Save pages' multi-select toolbar (not shown on
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
      tags: [] as string[],
    })),
    { onConflict: 'user_id,feed_item_id' }
  )
  if (error) return { error: error.message }

  // Bulk equivalent of setState's single-item assignArticleToFolder(id,
  // null) — a loop over N ids would be N round trips for what's already a
  // one-row-per-id delete.
  const { error: folderError } = await supabase
    .from('article_folders')
    .delete()
    .eq('user_id', user.id)
    .in('feed_item_id', feedItemIds)
  if (folderError) console.error('articles/archiveArticlesBulk: clear folders', folderError)

  revalidatePath('/')
  return { error: null }
}

// Unlike deleteArticle/clearArticleState above (which only remove *your*
// curation row), this permanently deletes the feed_items rows themselves —
// the shared article record, cascading to every user's article_states,
// read_items, article_folders, and article_content for these ids.
// Reachable from the Articles/Save/Archive bulk toolbar alike — this can
// delete an article someone explicitly saved, by design (see
// ArticlesView's confirm-to-delete step, the only guard against a stray
// click). feedItemIds only ever comes from a user's on-screen selection,
// not a derived "everything matching X" set, so unlike the article list
// queries this fixed, there's no id-list-size scaling concern here.
export async function purgeArticles(feedItemIds: string[]): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }
  if (feedItemIds.length === 0) return { error: null }

  const supabase = await createClient()
  const { error } = await supabase.from('feed_items').delete().in('id', feedItemIds)
  if (error) return { error: error.message }

  revalidatePath('/')
  return { error: null }
}

// Display-only read tracking (see src/app/read/[id]/page.tsx) — must
// never touch article_states/archived_at, since read state is explicitly
// independent of the 24h auto-archive timer.
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

// Notes only make sense once an article has a curation row (Read, Save, or
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

// Tagging saves an article, the same way filing it into a folder already
// does (see handleFolderChange in useArticleCardActions.ts) — a non-empty
// tag set on a Read article promotes it to Save. Clearing tags never
// demotes it, mirroring the folder side (removing a folder doesn't unsave
// either).
export async function setArticleTags(
  feedItemId: string,
  tags: string[]
): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const normalized = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))]

  const supabase = await createClient()

  let promoteToSaved = false
  if (normalized.length > 0) {
    const { data: existing } = await supabase
      .from('article_states')
      .select('state')
      .eq('user_id', user.id)
      .eq('feed_item_id', feedItemId)
      .maybeSingle()
    promoteToSaved = existing?.state !== 'saved'
  }

  const { error } = promoteToSaved
    ? await supabase.from('article_states').upsert(
        {
          user_id: user.id,
          feed_item_id: feedItemId,
          state: 'saved' as const,
          archived_at: null,
          tags: normalized,
        },
        { onConflict: 'user_id,feed_item_id' }
      )
    : await supabase
        .from('article_states')
        .update({ tags: normalized })
        .eq('user_id', user.id)
        .eq('feed_item_id', feedItemId)

  if (error) return { error: error.message }

  revalidatePath('/')
  return { error: null }
}
