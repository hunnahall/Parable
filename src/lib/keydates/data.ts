import { createClient, getUser } from '@/lib/supabase/server'
import { logQueryError } from '@/lib/supabase/logError'

export interface KeyDateRow {
  id: string
  title: string
  event_date: string
  created_at: string
}

// Fetched ascending, then reshaped so the list reads upcoming-first: future
// dates stay soonest-first, past dates flip to most-recent-first and sink
// below them — closer to listTasks' "done sinks to the bottom, not
// deleted" treatment than to hiding past entries outright, since a
// one-off date that just passed is still often useful context for a few
// days (see src/lib/keydates/actions.ts — there's no recurrence, so a
// passed date can't just "come back around").
export async function listKeyDates(): Promise<KeyDateRow[]> {
  const user = await getUser()
  if (!user) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('key_dates')
    .select('id, title, event_date, created_at')
    .eq('user_id', user.id)
    .order('event_date', { ascending: true })
  logQueryError('keydates/listKeyDates', error)
  if (!data) return []

  const today = new Date().toISOString().slice(0, 10)
  const upcoming = data.filter((row) => row.event_date >= today)
  const past = data.filter((row) => row.event_date < today).reverse()
  return [...upcoming, ...past]
}
