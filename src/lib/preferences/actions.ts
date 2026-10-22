'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getUser } from '@/lib/supabase/server'
import type { UserPreferences } from './data'

const COLUMNS: Record<keyof UserPreferences, string> = {
  theme: 'theme',
  sidebarCollapsed: 'sidebar_collapsed',
  language: 'language',
  autoDeleteKeywords: 'auto_delete_keywords',
  inboxView: 'inbox_view',
}

// Writes only the fields passed. Sending the whole preferences object from
// a page-load snapshot overwrote anything changed elsewhere since, such as
// keywords edited on /filters in another tab.
export async function updatePreferences(
  changes: Partial<UserPreferences>
): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const row: Record<string, unknown> = { user_id: user.id, updated_at: new Date().toISOString() }
  for (const [key, value] of Object.entries(changes)) {
    const column = COLUMNS[key as keyof UserPreferences]
    if (column && value !== undefined) row[column] = value
  }

  const supabase = await createClient()
  const { error } = await supabase.from('user_preferences').upsert(row)
  if (error) return { error: error.message }

  // Theme renders as data-theme on <html> in the root layout, which only a
  // server round trip can reach.
  revalidatePath('/', 'layout')
  return { error: null }
}

export async function setSidebarCollapsed(collapsed: boolean): Promise<{ error: string | null }> {
  return updatePreferences({ sidebarCollapsed: collapsed })
}
