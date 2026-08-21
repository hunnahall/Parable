import { createClient, getUser } from '@/lib/supabase/server'
import { logQueryError } from '@/lib/supabase/logError'

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
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  font: 'inter',
  timezone: '',
  clockFormat: '24h',
  theme: 'system',
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
    .select('font, timezone, clock_format, theme')
    .eq('user_id', user.id)
    .maybeSingle()
  logQueryError('preferences/getUserPreferences', error)
  if (!data) return DEFAULT_PREFERENCES

  return {
    font: data.font as FontChoice,
    timezone: data.timezone,
    clockFormat: data.clock_format as ClockFormat,
    theme: data.theme as ThemeChoice,
  }
}
