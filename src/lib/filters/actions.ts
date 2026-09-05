'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getUser } from '@/lib/supabase/server'
import { feedItemsRpc, UNFILED_EXCLUDED_STATES } from '@/lib/articles/list'
import { applyFilings, planFilings, type TitledItem } from '@/lib/filters/filing'

export async function addFilterRule(
  keyword: string,
  folderId: string
): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const trimmed = keyword.trim()
  if (!trimmed) return { error: 'Enter a word to match.' }
  if (!folderId) return { error: 'Pick a folder.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('filter_rules')
    .upsert(
      { user_id: user.id, keyword: trimmed, folder_id: folderId },
      { onConflict: 'user_id,keyword,folder_id', ignoreDuplicates: true }
    )
  if (error) return { error: error.message }

  revalidatePath('/filters')
  return { error: null }
}

export async function removeFilterRule(id: string): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('filter_rules')
    .delete()
    .eq('user_id', user.id)
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/filters')
  return { error: null }
}

// Retroactively applies the Rules block to whatever's currently in the
// Inbox, mirroring "Run filters now" — ingest only ever applies a rule to
// an item as it's first fetched, so a rule added afterwards would never
// touch what's already sitting there.
//
// Scoped to unfiled articles only: a saved or archived article reflects an
// explicit decision, and a filing rule is pre-triage automation, not an
// override of one.
export async function runFilterRulesNow(): Promise<{
  error: string | null
  filedCount: number
}> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in', filedCount: 0 }

  const supabase = await createClient()

  const { data: rules, error: rulesError } = await supabase
    .from('filter_rules')
    .select('keyword, folder_id')
    .eq('user_id', user.id)
  if (rulesError) return { error: rulesError.message, filedCount: 0 }
  if (!rules || rules.length === 0) return { error: null, filedCount: 0 }

  const { data: items, error: itemsError } = await feedItemsRpc(
    supabase,
    'feed_items_excluding_states',
    { p_user_id: user.id, p_exclude_states: UNFILED_EXCLUDED_STATES }
  ).select('id, title, title_en')
  if (itemsError) return { error: itemsError.message, filedCount: 0 }

  const filings = planFilings((items ?? []) as TitledItem[], rules)
  if (filings.size === 0) return { error: null, filedCount: 0 }

  const { error: writeError } = await applyFilings(supabase, user.id, filings)
  if (writeError) return { error: writeError, filedCount: 0 }

  revalidatePath('/inbox')
  revalidatePath('/saved')
  revalidatePath('/', 'layout')
  return { error: null, filedCount: filings.size }
}
