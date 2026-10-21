'use server'

import { createClient, getUser } from '@/lib/supabase/server'

// Records that the reader has had these stories on screen. No revalidate:
// the Inbox dims them locally, and the next load reads story_views.
export async function markStoriesSeen(storyIds: string[]): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }
  const unique = [...new Set(storyIds)]
  if (unique.length === 0) return { error: null }

  const supabase = await createClient()
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('story_views')
    .upsert(
      unique.map((storyId) => ({ user_id: user.id, story_id: storyId, seen_at: now })),
      { onConflict: 'user_id,story_id' }
    )
  return { error: error?.message ?? null }
}
