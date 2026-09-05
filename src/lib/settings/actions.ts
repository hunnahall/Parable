'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getUser } from '@/lib/supabase/server'
import { feedItemsRpc, UNFILED_EXCLUDED_STATES } from '@/lib/articles/list'
import { matchedAutoDeleteKeyword } from '@/lib/feeds/autoDelete'

// Wipes everything that belongs to this account — subscriptions, folders,
// per-article curation (saved, archived, notes, read state, folder
// placement) and preferences — so the app comes back looking like a brand
// new signup.
//
// Scoped to this user throughout. The shared catalog (feeds, feed_items,
// is deliberately untouched: those rows are read by every
// subscriber, and a feed nobody subscribes to any more is already
// soft-deleted by removeFeed and reclaimed by the retention jobs.
export async function performFullReset(): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const supabase = await createClient()

  const { error: subscriptionsError } = await supabase
    .from('subscriptions')
    .delete()
    .eq('user_id', user.id)
  if (subscriptionsError) return { error: subscriptionsError.message }

  // Cascades to feed_folders, article_folders and filter_rules via their FKs.
  const { error: foldersError } = await supabase.from('folders').delete().eq('user_id', user.id)
  if (foldersError) return { error: foldersError.message }

  // Belt and braces: a rule whose folder is already gone would have
  // cascaded above, but a full reset shouldn't depend on that to be
  // complete.
  const { error: rulesError } = await supabase
    .from('filter_rules')
    .delete()
    .eq('user_id', user.id)
  if (rulesError) return { error: rulesError.message }

  const { error: statesError } = await supabase
    .from('article_states')
    .delete()
    .eq('user_id', user.id)
  if (statesError) return { error: statesError.message }

  const { error: readError } = await supabase.from('read_items').delete().eq('user_id', user.id)
  if (readError) return { error: readError.message }

  const { error: prefsError } = await supabase
    .from('user_preferences')
    .delete()
    .eq('user_id', user.id)
  if (prefsError) return { error: prefsError.message }

  revalidatePath('/', 'layout')
  return { error: null }
}

// "Bring my inbox to zero": archives every currently-unfiled article (no
// article_states row at all) for this user in one shot — the same
// state transition archiveArticle() applies one at a time (see
// src/lib/articles/actions.ts), and the same "unfiled" predicate the
// Articles page and its sidebar badge use (see getArticlesUnfiledCount in
// src/lib/articles/list.ts). Saved articles, notes, read history,
// feeds, and folders are all untouched — only feed_items with zero
// article_states rows are affected, so this can never touch (or need to
// check) a saved or filed article.
export async function performPartialReset(): Promise<{
  error: string | null
  archivedCount: number
}> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in', archivedCount: 0 }

  const supabase = await createClient()

  // The same unfiled predicate the Inbox uses, done as a SQL anti-join
  // instead of fetching every filed id and interpolating it into a
  // `.not('id', 'in', ...)` filter, which blows past PostgREST's URL limit
  // once article_states is into the hundreds.
  const { data: unfiledItems, error: itemsError } = await feedItemsRpc(
    supabase,
    'feed_items_excluding_states',
    { p_user_id: user.id, p_exclude_states: UNFILED_EXCLUDED_STATES }
  ).select('id')
  if (itemsError) return { error: itemsError.message, archivedCount: 0 }

  const unfiledIds = ((unfiledItems ?? []) as { id: string }[]).map((row) => row.id)
  if (unfiledIds.length === 0) return { error: null, archivedCount: 0 }

  const now = new Date().toISOString()
  // Plain insert, not upsert: unfiledIds is definitionally the set of
  // items with no existing article_states row, so there's no conflict to
  // handle.
  const { error: insertError } = await supabase.from('article_states').insert(
    unfiledIds.map((feedItemId) => ({
      user_id: user.id,
      feed_item_id: feedItemId,
      state: 'archived' as const,
      archived_at: now,
    }))
  )
  if (insertError) return { error: insertError.message, archivedCount: 0 }

  revalidatePath('/')
  return { error: null, archivedCount: unfiledIds.length }
}

// Retroactively applies the Filters list (see FiltersForm) to whatever's
// currently in the Inbox — runIngest's ingest-time check
// (src/lib/feeds/ingest.ts) only ever applies to an item as it's first
// fetched, so a filter added after an article was already ingested would
// otherwise never touch it.
// Scoped to the same "unfiled" predicate as the Inbox page and its sidebar
// badge (see getArticlesUnfiledCount in src/lib/articles/list.ts):
// saved/archived articles reflect a user's explicit curation, which
// this blocklist — a pre-triage junk filter, not an override — shouldn't
// touch.
export async function runAutoDeleteRulesNow(): Promise<{
  error: string | null
  deletedCount: number
}> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in', deletedCount: 0 }

  const supabase = await createClient()

  const { data: prefsRow, error: prefsError } = await supabase
    .from('user_preferences')
    .select('auto_delete_keywords')
    .eq('user_id', user.id)
    .maybeSingle()
  if (prefsError) return { error: prefsError.message, deletedCount: 0 }

  const keywords: string[] = prefsRow?.auto_delete_keywords ?? []
  if (keywords.length === 0) return { error: null, deletedCount: 0 }

  const { data: items, error: itemsError } = await feedItemsRpc(
    supabase,
    'feed_items_excluding_states',
    { p_user_id: user.id, p_exclude_states: UNFILED_EXCLUDED_STATES }
  ).select('id, title, title_en')
  if (itemsError) return { error: itemsError.message, deletedCount: 0 }

  const matchedIds = ((items ?? []) as { id: string; title: string; title_en: string | null }[])
    .filter((item) => matchedAutoDeleteKeyword(item.title_en ?? item.title, keywords))
    .map((item) => item.id)

  if (matchedIds.length === 0) return { error: null, deletedCount: 0 }

  // A per-user tombstone, same as purgeArticles (src/lib/articles/actions.ts):
  // your filter list is yours, so it must not delete the shared feed_items
  // row another subscriber is still reading. Safe to write state
  // unconditionally because matchedIds only ever came from the unfiled set
  // above, so none of them have a saved/archived state to lose.
  const now = new Date().toISOString()
  const { error: deleteError } = await supabase.from('article_states').upsert(
    matchedIds.map((feedItemId) => ({
      user_id: user.id,
      feed_item_id: feedItemId,
      state: 'deleted' as const,
      archived_at: now,
    })),
    { onConflict: 'user_id,feed_item_id' }
  )
  if (deleteError) return { error: deleteError.message, deletedCount: 0 }

  revalidatePath('/inbox')
  revalidatePath('/', 'layout')
  return { error: null, deletedCount: matchedIds.length }
}
