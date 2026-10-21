'use server'

import { createClient, getUser } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { summarizeToTarget } from '@/lib/summarize'
import { recordAiUsage } from './stream'

// Saving a story keeps every article in it, each with a two-sentence
// summary (context.md, Retention). Writes one for any article that has
// none yet, from its stored text. Called after the save, without waiting.
export async function ensureSummaries(feedItemIds: string[]): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }
  if (feedItemIds.length === 0) return { error: null }

  // The reader's own client, so only articles they can see are touched.
  const supabase = await createClient()
  const { data: items, error } = await supabase
    .from('feed_items')
    .select('id, title, title_en, summary_ai, feed_item_texts(text)')
    .in('id', feedItemIds)
    .is('summary_ai', null)
  if (error) return { error: error.message }

  const admin = adminClient()
  for (const item of items ?? []) {
    const stored = item.feed_item_texts as unknown as { text: string } | { text: string }[] | null
    const text = (Array.isArray(stored) ? stored[0]?.text : stored?.text) ?? ''
    if (!text.trim()) continue

    const { summary, usage } = await summarizeToTarget(item.title, text)
    await recordAiUsage({ userId: user.id, feedItemId: item.id, kind: 'summary', usage, firstTextMs: null })
    if (!summary) continue
    const { error: writeError } = await admin
      .from('feed_items')
      .update({ summary_ai: summary })
      .eq('id', item.id)
      .is('summary_ai', null)
    if (writeError) console.error('ensureSummaries: failed to store', writeError.message)
  }
  return { error: null }
}
