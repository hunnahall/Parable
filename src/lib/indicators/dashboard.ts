import { createClient, getUser } from '@/lib/supabase/server'
import { logQueryError } from '@/lib/supabase/logError'
import { outlierFlags } from './notable'

export interface IndicatorDashboardWidget {
  id: string // user_widgets.id — the grid item key
  indicatorId: string
  displayName: string | null
  seriesCode: string
  position: number
  latestValue: number | null
  previousValue: number | null
  readings: { date: string; value: number; notable: boolean }[]
}

export interface IndicatorDashboardOption {
  id: string
  displayName: string | null
  seriesCode: string
}

const READINGS_PER_WIDGET = 30

// The dashboard's contents (user_widgets, ordered by position) plus the
// set of tracked indicators NOT yet on it (for an "Add to dashboard"
// affordance) — every row in `indicators` is eligible by definition, no
// separate enable/select flag needed (see plan §1.4/§6).
export async function listIndicatorDashboardWidgets(): Promise<{
  widgets: IndicatorDashboardWidget[]
  availableToAdd: IndicatorDashboardOption[]
}> {
  const user = await getUser()
  if (!user) return { widgets: [], availableToAdd: [] }

  const supabase = await createClient()

  const { data: indicators, error: indicatorsError } = await supabase
    .from('indicators')
    .select('id, display_name, series_code')
    .order('display_name')
  logQueryError('indicators/listIndicatorDashboardWidgets (indicators)', indicatorsError)
  if (!indicators) return { widgets: [], availableToAdd: [] }

  const { data: placements, error: placementsError } = await supabase
    .from('user_widgets')
    .select('id, indicator_id, position')
    .eq('user_id', user.id)
    .order('position')
  logQueryError('indicators/listIndicatorDashboardWidgets (placements)', placementsError)

  const placed = placements ?? []
  const placedIndicatorIds = new Set(placed.map((p) => p.indicator_id))
  const indicatorById = new Map(indicators.map((i) => [i.id, i]))

  const { data: readings, error: readingsError } = await supabase
    .from('indicator_readings')
    .select('indicator_id, reading_date, value')
    .in('indicator_id', placed.map((p) => p.indicator_id))
    .order('reading_date', { ascending: false })
  logQueryError('indicators/listIndicatorDashboardWidgets (readings)', readingsError)

  const readingsByIndicator = new Map<string, { date: string; value: number }[]>()
  for (const reading of readings ?? []) {
    const list = readingsByIndicator.get(reading.indicator_id) ?? []
    if (list.length < READINGS_PER_WIDGET) {
      list.push({ date: reading.reading_date, value: reading.value })
      readingsByIndicator.set(reading.indicator_id, list)
    }
  }

  const widgets: IndicatorDashboardWidget[] = placed
    .map((p) => {
      const indicator = indicatorById.get(p.indicator_id)
      const recent = (readingsByIndicator.get(p.indicator_id) ?? []).slice().reverse()
      const flags = outlierFlags(recent.map((r) => r.value))
      return {
        id: p.id,
        indicatorId: p.indicator_id,
        displayName: indicator?.display_name ?? null,
        seriesCode: indicator?.series_code ?? '',
        position: p.position,
        latestValue: recent.at(-1)?.value ?? null,
        previousValue: recent.at(-2)?.value ?? null,
        readings: recent.map((r, i) => ({ ...r, notable: flags[i] })),
      }
    })
    .filter((w) => w.seriesCode !== '') // drop widgets whose indicator was deleted

  const availableToAdd: IndicatorDashboardOption[] = indicators
    .filter((i) => !placedIndicatorIds.has(i.id))
    .map((i) => ({ id: i.id, displayName: i.display_name, seriesCode: i.series_code }))

  return { widgets, availableToAdd }
}
