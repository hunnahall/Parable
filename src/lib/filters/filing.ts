import type { SupabaseClient } from '@supabase/supabase-js'
import { matchesKeyword } from '@/lib/feeds/autoDelete'

export interface RuleRow {
  keyword: string
  folder_id: string
}

export interface TitledItem {
  id: string
  title: string
  title_en: string | null
}

// An article can match several rules and land in several folders at once,
// so the result is (article -> set of folders), deduped so two rules
// pointing at the same folder don't collide. Matching is always against
// the translated title, so a rule works regardless of source language.
export function planFilings(
  items: TitledItem[],
  rules: RuleRow[]
): Map<string, Set<string>> {
  const filings = new Map<string, Set<string>>()
  for (const item of items) {
    const title = item.title_en ?? item.title
    for (const rule of rules) {
      if (!matchesKeyword(title, rule.keyword)) continue
      const folders = filings.get(item.id) ?? new Set<string>()
      folders.add(rule.folder_id)
      filings.set(item.id, folders)
    }
  }
  return filings
}

// Filing an article saves it, so both writes happen together: the
// article_states row is what makes it show up on Save, and the
// article_folders rows are what put it in the right folders there.
//
// Deliberately not a server action — ingest calls this with a service-role
// client on behalf of another user, and the Filters page calls it with the
// caller's own RLS-scoped client.
export async function applyFilings(
  supabase: SupabaseClient,
  userId: string,
  filings: Map<string, Set<string>>
): Promise<{ error: string | null }> {
  if (filings.size === 0) return { error: null }

  const { error: stateError } = await supabase.from('article_states').upsert(
    [...filings.keys()].map((feedItemId) => ({
      user_id: userId,
      feed_item_id: feedItemId,
      state: 'saved',
      archived_at: null,
    })),
    { onConflict: 'user_id,feed_item_id' }
  )
  if (stateError) return { error: stateError.message }

  const folderRows = [...filings.entries()].flatMap(([feedItemId, folderIds]) =>
    [...folderIds].map((folderId) => ({
      user_id: userId,
      feed_item_id: feedItemId,
      folder_id: folderId,
    }))
  )
  const { error: folderError } = await supabase
    .from('article_folders')
    .upsert(folderRows, {
      onConflict: 'feed_item_id,user_id,folder_id',
      ignoreDuplicates: true,
    })
  if (folderError) return { error: folderError.message }

  return { error: null }
}
