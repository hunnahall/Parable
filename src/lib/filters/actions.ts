'use server'

import { createClient, getUser } from '@/lib/supabase/server'
import { updatePreferences } from '@/lib/preferences/actions'
import { runAutoDeleteRulesNow } from '@/lib/settings/actions'

// "Hide stories with this word" on a story: adds the word to the reader's
// filters, then applies them to the Inbox right away so every matching
// story leaves, not only this one.
export async function hideStoriesWithWord(
  word: string
): Promise<{ error: string | null; hiddenCount: number }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in', hiddenCount: 0 }

  const keyword = word.trim()
  if (!keyword) return { error: 'Pick a word', hiddenCount: 0 }

  const supabase = await createClient()
  const { data: prefs, error: readError } = await supabase
    .from('user_preferences')
    .select('auto_delete_keywords')
    .eq('user_id', user.id)
    .maybeSingle()
  if (readError) return { error: readError.message, hiddenCount: 0 }

  const keywords: string[] = prefs?.auto_delete_keywords ?? []
  if (!keywords.some((k) => k.toLowerCase() === keyword.toLowerCase())) {
    const saved = await updatePreferences({ autoDeleteKeywords: [...keywords, keyword] })
    if (saved.error) return { error: saved.error, hiddenCount: 0 }
  }

  const result = await runAutoDeleteRulesNow()
  return { error: result.error, hiddenCount: result.deletedCount }
}
