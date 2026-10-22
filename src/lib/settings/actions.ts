'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getUser } from '@/lib/supabase/server'
import { feedItemsRpc, UNFILED_EXCLUDED_STATES } from '@/lib/articles/list'
import { matchedAutoDeleteKeyword } from '@/lib/feeds/autoDelete'
import { adminClient } from '@/lib/supabase/admin'
import { PAUSE_KEY } from './automation'

// Wipes everything that belongs to this account — subscriptions, folders,
// per-article curation (saved, archived, notes, read state, folder
// placement) and preferences, leaving an empty account.
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

  // Cascades to article_folders via its FK.
  const { error: foldersError } = await supabase.from('folders').delete().eq('user_id', user.id)
  if (foldersError) return { error: foldersError.message }

  const { error: categoriesError } = await supabase
    .from('categories')
    .delete()
    .eq('user_id', user.id)
  if (categoriesError) return { error: categoriesError.message }

  const { error: statesError } = await supabase
    .from('article_states')
    .delete()
    .eq('user_id', user.id)
  if (statesError) return { error: statesError.message }

  const { error: readError } = await supabase.from('read_items').delete().eq('user_id', user.id)
  if (readError) return { error: readError.message }

  const { error: opensError } = await supabase.from('feed_opens').delete().eq('user_id', user.id)
  if (opensError) return { error: opensError.message }

  const { error: prefsError } = await supabase
    .from('user_preferences')
    .delete()
    .eq('user_id', user.id)
  if (prefsError) return { error: prefsError.message }

  revalidatePath('/', 'layout')
  return { error: null }
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
  ).select('id, feed_id, title, title_en, link')
  if (itemsError) return { error: itemsError.message, deletedCount: 0 }

  const matched = (
    (items ?? []) as { id: string; feed_id: string; title: string; title_en: string | null; link: string | null }[]
  ).flatMap((item) => {
    const title = item.title_en ?? item.title
    const keyword = matchedAutoDeleteKeyword(title, keywords)
    return keyword === null ? [] : [{ item, title, keyword }]
  })
  const matchedIds = matched.map(({ item }) => item.id)

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

  // For the Inbox's "N filtered today". Best-effort.
  const { error: logError } = await supabase.from('filtered_titles').insert(
    matched.map(({ item, title, keyword }) => ({
      user_id: user.id,
      feed_id: item.feed_id,
      title,
      link: item.link,
      keyword,
    }))
  )
  if (logError) console.error('settings/runAutoDeleteRulesNow: log filtered titles', logError.message)

  revalidatePath('/inbox')
  revalidatePath('/', 'layout')
  return { error: null, deletedCount: matchedIds.length }
}

// Pauses or resumes automatic updates for every account: while paused the
// cron jobs skip their calls (see supabase/cron.sql), so no new articles
// load and nothing expires. Written with the service role, since
// app_settings is read-only to signed-in users.
export async function setAutomaticUpdatesPaused(paused: boolean): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const { error } = await adminClient()
    .from('app_settings')
    .upsert({ key: PAUSE_KEY, value: paused, updated_at: new Date().toISOString(), updated_by: user.id })
  if (error) return { error: error.message }

  // The status line in the layout, the Inbox banner and Settings all show it.
  revalidatePath('/', 'layout')
  return { error: null }
}
