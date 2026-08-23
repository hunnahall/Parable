'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getUser } from '@/lib/supabase/server'
import type { UserPreferences } from './data'

export async function updatePreferences(
  prefs: UserPreferences
): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const supabase = await createClient()
  const { error } = await supabase.from('user_preferences').upsert({
    user_id: user.id,
    font: prefs.font,
    timezone: prefs.timezone,
    clock_format: prefs.clockFormat,
    theme: prefs.theme,
    sidebar_collapsed: prefs.sidebarCollapsed,
    language: prefs.language,
    auto_delete_enabled: prefs.autoDeleteEnabled,
    auto_delete_keywords: prefs.autoDeleteKeywords,
    summarize_articles: prefs.summarizeEnabled,
    updated_at: new Date().toISOString(),
  })
  if (error) return { error: error.message }

  // Theme/font apply via attributes rendered on <html> in the root layout
  // (see src/app/layout.tsx) — a client-only state update can't reach
  // those, so this needs the full server round-trip, unlike most other
  // mutations in this app.
  revalidatePath('/', 'layout')
  return { error: null }
}

export async function setSidebarCollapsed(collapsed: boolean): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const supabase = await createClient()
  const { error } = await supabase.from('user_preferences').upsert({
    user_id: user.id,
    sidebar_collapsed: collapsed,
    updated_at: new Date().toISOString(),
  })
  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  return { error: null }
}
