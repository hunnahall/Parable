import { createClient } from '@/lib/supabase/server'
import { logQueryError } from '@/lib/supabase/logError'
import { outlierFlags } from './notable'

export interface IndicatorRow {
  id: string
  source: string
  series_code: string
  display_name: string | null
  description: string | null
  latest_reading_date: string | null
  recent_readings: { date: string; value: number; notable: boolean }[]
}

const RECENT_READINGS_PER_INDICATOR = 20
const COMPARE_READINGS_LIMIT = 260

export async function listIndicatorsDetailed(): Promise<IndicatorRow[]> {
  const supabase = await createClient()
  const { data: indicators, error: indicatorsError } = await supabase
    .from('indicators')
    .select('id, source, series_code, display_name, description')
    .order('display_name')
  logQueryError('indicators/listIndicatorsDetailed (indicators)', indicatorsError)

  if (!indicators) return []

  const { data: readings, error: readingsError } = await supabase
    .from('indicator_readings')
    .select('indicator_id, reading_date, value')
    .in('indicator_id', indicators.map((indicator) => indicator.id))
    .order('reading_date', { ascending: false })
  logQueryError('indicators/listIndicatorsDetailed (readings)', readingsError)

  // Readings come back newest-first per indicator, so capping each
  // indicator's list at RECENT_READINGS_PER_INDICATOR as we go is enough
  // for a sparkline without a second query.
  const readingsByIndicator = new Map<string, { date: string; value: number }[]>()
  for (const reading of readings ?? []) {
    const list = readingsByIndicator.get(reading.indicator_id) ?? []
    if (list.length < RECENT_READINGS_PER_INDICATOR) {
      list.push({ date: reading.reading_date, value: reading.value })
      readingsByIndicator.set(reading.indicator_id, list)
    }
  }

  return indicators.map((indicator) => {
    const recent = (readingsByIndicator.get(indicator.id) ?? []).slice().reverse()
    const flags = outlierFlags(recent.map((r) => r.value))
    return {
      ...indicator,
      latest_reading_date: recent.at(-1)?.date ?? null,
      recent_readings: recent.map((r, i) => ({ ...r, notable: flags[i] })),
    }
  })
}

export interface ComparisonSeries {
  id: string
  display_name: string | null
  series_code: string
  // % change from this series' own first fetched reading — puts series
  // with wildly different units/scales (a %, an index, a dollar figure)
  // on one comparable axis.
  points: { date: string; changePct: number; notable: boolean }[]
}

export async function getComparisonData(indicatorIds: string[]): Promise<ComparisonSeries[]> {
  if (indicatorIds.length === 0) return []

  const supabase = await createClient()
  const { data: indicators, error: indicatorsError } = await supabase
    .from('indicators')
    .select('id, display_name, series_code')
    .in('id', indicatorIds)
  logQueryError('indicators/getComparisonData (indicators)', indicatorsError)

  if (!indicators) return []

  const results: ComparisonSeries[] = []
  for (const indicator of indicators) {
    const { data: readings, error: readingsError } = await supabase
      .from('indicator_readings')
      .select('reading_date, value')
      .eq('indicator_id', indicator.id)
      .order('reading_date', { ascending: false })
      .limit(COMPARE_READINGS_LIMIT)
    logQueryError('indicators/getComparisonData (readings)', readingsError)

    const ordered = (readings ?? []).slice().reverse()
    const base = ordered[0]?.value
    // Computed on the raw readings, not the rebased % change below — a
    // z-score over already-normalized percentages would answer "is this %
    // change unusual relative to other % changes" instead of the intended
    // "is this raw reading unusual relative to its own history."
    const flags = outlierFlags(ordered.map((r) => r.value))

    const points =
      base !== undefined && base !== 0
        ? ordered.map((r, i) => ({
            date: r.reading_date,
            changePct: ((r.value - base) / Math.abs(base)) * 100,
            notable: flags[i],
          }))
        : []

    results.push({
      id: indicator.id,
      display_name: indicator.display_name,
      series_code: indicator.series_code,
      points,
    })
  }

  return results
}
