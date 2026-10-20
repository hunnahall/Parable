import { createClient, getUser } from '@/lib/supabase/server'
import { logQueryError } from '@/lib/supabase/logError'
import { DEFAULT_LANGUAGE } from '@/lib/languages'

// 'system' follows the device (dark unless it asks for light); see
// data-theme on <html> in src/app/layout.tsx.
export type ThemeChoice = 'system' | 'dark' | 'light'

export interface UserPreferences {
  theme: ThemeChoice
  sidebarCollapsed: boolean
  // ISO 639-1 code (see src/lib/languages.ts) — the target language for
  // ingest-time title/summary translation and translate-on-open, not a UI
  // locale. Articles already in this language are left untranslated.
  language: string
  // Case-insensitive substring match against the (already-translated)
  // title — see runIngest in src/lib/feeds/ingest.ts for where this is
  // applied.
  autoDeleteKeywords: string[]
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'system',
  sidebarCollapsed: false,
  language: DEFAULT_LANGUAGE,
  autoDeleteKeywords: [],
}

// No row is created for a user until they first change a setting — every
// column has a DB default anyway, so a missing row is equivalent to one
// full of defaults.
export async function getUserPreferences(): Promise<UserPreferences> {
  const user = await getUser()
  if (!user) return DEFAULT_PREFERENCES

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('user_preferences')
    .select('theme, sidebar_collapsed, language, auto_delete_keywords')
    .eq('user_id', user.id)
    .maybeSingle()
  logQueryError('preferences/getUserPreferences', error)
  if (!data) return DEFAULT_PREFERENCES

  return {
    theme: (data.theme ?? 'system') as ThemeChoice,
    sidebarCollapsed: data.sidebar_collapsed,
    language: data.language,
    autoDeleteKeywords: data.auto_delete_keywords ?? [],
  }
}
