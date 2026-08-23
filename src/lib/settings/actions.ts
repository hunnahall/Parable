'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getUser } from '@/lib/supabase/server'

// Wipes every feed, article, and piece of per-article curation (saved,
// archived, tags, notes, read state, folder placement) plus every other
// per-user setting (preferences, dashboard/indicator widget layout, key
// dates, tasks) — everything except the auth account itself, so the app
// comes back looking like a brand new signup.
//
// feeds/folders/categories have no per-user ownership column (a known
// schema gap — see removeFeed in src/lib/feeds/actions.ts, which already
// deletes a feed unscoped), so this clears them outright rather than
// trying to scope a delete that isn't representable at the schema level.
// Only one account exists on this project today, so that's equivalent to
// "your data" in practice.
export async function performFullReset(): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const supabase = await createClient()

  // Cascades to feed_items, which cascades to article_states, read_items,
  // article_folders, article_content, and saved_items.
  const { error: feedsError } = await supabase.from('feeds').delete().not('id', 'is', null)
  if (feedsError) return { error: feedsError.message }

  // Cascades to feed_folders, article_folders, and its own children —
  // mostly redundant with the feeds delete above, but needed for any
  // folder that doesn't currently hold a feed.
  const { error: foldersError } = await supabase.from('folders').delete().not('id', 'is', null)
  if (foldersError) return { error: foldersError.message }

  const { error: categoriesError } = await supabase
    .from('categories')
    .delete()
    .not('name', 'is', null)
  if (categoriesError) return { error: categoriesError.message }

  const { error: prefsError } = await supabase
    .from('user_preferences')
    .delete()
    .eq('user_id', user.id)
  if (prefsError) return { error: prefsError.message }

  const { error: dashboardError } = await supabase
    .from('dashboard_widgets')
    .delete()
    .eq('user_id', user.id)
  if (dashboardError) return { error: dashboardError.message }

  const { error: widgetsError } = await supabase
    .from('user_widgets')
    .delete()
    .eq('user_id', user.id)
  if (widgetsError) return { error: widgetsError.message }

  const { error: keyDatesError } = await supabase.from('key_dates').delete().eq('user_id', user.id)
  if (keyDatesError) return { error: keyDatesError.message }

  const { error: tasksError } = await supabase.from('tasks').delete().eq('user_id', user.id)
  if (tasksError) return { error: tasksError.message }

  revalidatePath('/', 'layout')
  return { error: null }
}

// "Bring my inbox to zero": archives every currently-unfiled article (no
// article_states row at all) for this user in one shot — the same
// state transition archiveArticle() applies one at a time (see
// src/lib/articles/actions.ts), and the same "unfiled" predicate the
// Articles page and its sidebar badge use (see getArticlesUnfiledCount in
// src/lib/dashboard/data.ts). Saved articles, tags, notes, read history,
// feeds, and folders are all untouched — only feed_items with zero
// article_states rows are affected, so this can never touch (or need to
// check) a saved/tagged/read article.
export async function performPartialReset(): Promise<{
  error: string | null
  archivedCount: number
}> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in', archivedCount: 0 }

  const supabase = await createClient()

  const { data: stateRows, error: statesError } = await supabase
    .from('article_states')
    .select('feed_item_id')
    .eq('user_id', user.id)
  if (statesError) return { error: statesError.message, archivedCount: 0 }

  const filedIds = (stateRows ?? []).map((row) => row.feed_item_id)

  let query = supabase.from('feed_items').select('id')
  if (filedIds.length > 0) {
    query = query.not('id', 'in', `(${filedIds.join(',')})`)
  }
  const { data: unfiledItems, error: itemsError } = await query
  if (itemsError) return { error: itemsError.message, archivedCount: 0 }

  const unfiledIds = (unfiledItems ?? []).map((row) => row.id)
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
