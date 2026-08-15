import { createClient } from '@/lib/supabase/server'

export interface IndicatorRow {
  id: string
  source: string
  series_code: string
  display_name: string | null
  latest_reading_date: string | null
}

export async function listIndicatorsDetailed(): Promise<IndicatorRow[]> {
  const supabase = await createClient()
  const { data: indicators } = await supabase
    .from('indicators')
    .select('id, source, series_code, display_name')
    .order('display_name')

  if (!indicators) return []

  const { data: readings } = await supabase
    .from('indicator_readings')
    .select('indicator_id, reading_date')
    .in('indicator_id', indicators.map((indicator) => indicator.id))
    .order('reading_date', { ascending: false })

  // First occurrence per indicator_id wins, since readings are ordered
  // newest-first — cheaper than a query per indicator.
  const latestByIndicator = new Map<string, string>()
  for (const reading of readings ?? []) {
    if (!latestByIndicator.has(reading.indicator_id)) {
      latestByIndicator.set(reading.indicator_id, reading.reading_date)
    }
  }

  return indicators.map((indicator) => ({
    ...indicator,
    latest_reading_date: latestByIndicator.get(indicator.id) ?? null,
  }))
}
