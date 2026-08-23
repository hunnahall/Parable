import { createClient, getUser } from '@/lib/supabase/server'
import { logQueryError } from '@/lib/supabase/logError'
import { DEFAULT_LANGUAGE } from '@/lib/languages'

export type FontChoice = 'inter' | 'hanken-grotesk' | 'work-sans' | 'instrument-sans' | 'lato'
export type ClockFormat = '12h' | '24h'
export type ThemeChoice = 'light' | 'dark' | 'system'

export interface UserPreferences {
  font: FontChoice
  // '' means auto-detect from the browser rather than an explicit
  // IANA override — see src/lib/formatting.ts.
  timezone: string
  clockFormat: ClockFormat
  theme: ThemeChoice
  sidebarCollapsed: boolean
  // ISO 639-1 code (see src/lib/languages.ts) — the target language for
  // ingest-time title/summary translation and translate-on-open, not a UI
  // locale. Articles already in this language are left untranslated.
  language: string
  autoDeleteEnabled: boolean
  // Case-insensitive substring match against the (already-translated)
  // title — see runIngest in src/lib/feeds/ingest.ts for where this is
  // applied.
  autoDeleteKeywords: string[]
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  font: 'inter',
  timezone: '',
  clockFormat: '24h',
  theme: 'system',
  sidebarCollapsed: false,
  language: DEFAULT_LANGUAGE,
  autoDeleteEnabled: false,
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
    .select(
      'font, timezone, clock_format, theme, sidebar_collapsed, language, auto_delete_enabled, auto_delete_keywords'
    )
    .eq('user_id', user.id)
    .maybeSingle()
  logQueryError('preferences/getUserPreferences', error)
  if (!data) return DEFAULT_PREFERENCES

  return {
    font: data.font as FontChoice,
    timezone: data.timezone,
    clockFormat: data.clock_format as ClockFormat,
    theme: data.theme as ThemeChoice,
    sidebarCollapsed: data.sidebar_collapsed,
    language: data.language,
    autoDeleteEnabled: data.auto_delete_enabled,
    autoDeleteKeywords: data.auto_delete_keywords ?? [],
  }
}
