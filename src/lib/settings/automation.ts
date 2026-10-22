import { cache } from 'react'
import { createClient, getUser } from '@/lib/supabase/server'
import { logQueryError } from '@/lib/supabase/logError'

// The app_settings key the cron jobs check (supabase/cron.sql).
export const PAUSE_KEY = 'automatic_updates_paused'

export interface AutomationState {
  paused: boolean
  // When it was last paused or resumed, or null if never.
  changedAt: string | null
}

// Whether automatic updates (the 2-hourly ingest and hourly retention) are
// paused. One flag for every account, since ingest is one shared job.
// Cached per request: the layout's status line, the Inbox banner and
// Settings all read it.
export const getAutomationState = cache(async (): Promise<AutomationState> => {
  const user = await getUser()
  if (!user) return { paused: false, changedAt: null }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('app_settings')
    .select('value, updated_at')
    .eq('key', PAUSE_KEY)
    .maybeSingle()
  logQueryError('settings/getAutomationState', error)
  return { paused: data?.value === true, changedAt: data?.updated_at ?? null }
})
