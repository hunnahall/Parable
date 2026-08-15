import { createClient } from '@supabase/supabase-js'

const FRED_OBSERVATIONS_URL = 'https://api.stlouisfed.org/fred/series/observations'
const FETCH_TIMEOUT_MS = 15_000

// EIA support isn't implemented yet — no EIA indicators are seeded, and
// EIA v2 organizes data under source-specific route hierarchies (e.g.
// /v2/petroleum/pri/spt/data/) rather than one flat series endpoint like
// FRED, so it needs a real series to design and test against rather than
// a best guess. `runFetchIndicators` below fails a row with source "EIA"
// per-indicator (not a fatal error) until this is added back.

interface Reading {
  date: string
  value: number
}

export interface IndicatorFailure {
  indicatorId: string
  seriesCode: string
  error: string
}

export interface FetchIndicatorsSummary {
  indicatorsProcessed: number
  indicatorsFailed: IndicatorFailure[]
  readingsUpserted: number
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  )
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

// `since`, when set, is passed as an inclusive start date rather than
// since-date-plus-one. That means the last already-stored date gets
// re-fetched and re-upserted every run — deliberately: it's a cheap way
// to pick up a same-day revision FRED might publish after the fact, and
// the (indicator_id, reading_date) primary key makes the re-upsert a
// no-op cost-wise, not a duplicate.

async function fetchFredReadings(
  seriesCode: string,
  since: string | null
): Promise<Reading[]> {
  const apiKey = process.env.FRED_API_KEY
  if (!apiKey) throw new Error('FRED_API_KEY is not set')

  const url = new URL(FRED_OBSERVATIONS_URL)
  url.searchParams.set('series_id', seriesCode)
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('file_type', 'json')
  url.searchParams.set('sort_order', 'asc')
  if (since) url.searchParams.set('observation_start', since)

  const response = await fetchWithTimeout(url.toString())
  if (!response.ok) {
    throw new Error(`FRED returned ${response.status} ${response.statusText}`)
  }

  const data: { observations?: Array<{ date: string; value: string }> } =
    await response.json()

  const readings: Reading[] = []
  for (const obs of data.observations ?? []) {
    // FRED uses the literal string "." for a missing/not-yet-reported
    // observation on an otherwise-valid date. Skip it rather than storing
    // garbage or throwing.
    if (obs.value === '.' || obs.value === undefined) continue
    const value = Number(obs.value)
    if (!Number.isFinite(value)) continue
    readings.push({ date: obs.date, value })
  }
  return readings
}

// Shared by the cron-triggered /api/cron/fetch-indicators route and the
// "Fetch latest readings now" button in the indicators management UI
// (src/lib/indicators/actions.ts).
export async function runFetchIndicators(
  seriesFilter: string | null
): Promise<FetchIndicatorsSummary> {
  const supabase = adminClient()

  // `indicators` has no active/enabled flag today, so every row is
  // fetched. If you want to disable a series without deleting its config
  // or history, add e.g. `is_active boolean default true` and filter on
  // it here.
  let query = supabase.from('indicators').select('id, source, series_code, display_name')
  if (seriesFilter) {
    query = query.eq('series_code', seriesFilter)
  }
  const { data: indicators, error: indicatorsError } = await query

  if (indicatorsError) {
    throw new Error(`Failed to load indicators: ${indicatorsError.message}`)
  }

  let indicatorsProcessed = 0
  let readingsUpserted = 0
  const indicatorsFailed: IndicatorFailure[] = []

  for (const indicator of indicators ?? []) {
    try {
      const { data: latest, error: latestError } = await supabase
        .from('indicator_readings')
        .select('reading_date')
        .eq('indicator_id', indicator.id)
        .order('reading_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (latestError) {
        throw new Error(
          `Failed to look up latest reading: ${latestError.message}`
        )
      }

      const since = latest?.reading_date ?? null

      let readings: Reading[]
      switch (indicator.source.toUpperCase()) {
        case 'FRED':
          readings = await fetchFredReadings(indicator.series_code, since)
          break
        case 'EIA':
          throw new Error('EIA source not yet implemented')
        default:
          throw new Error(`Unknown source "${indicator.source}"`)
      }

      const rows = readings.map((reading) => ({
        indicator_id: indicator.id,
        reading_date: reading.date,
        value: reading.value,
      }))

      if (rows.length > 0) {
        const { error: upsertError } = await supabase
          .from('indicator_readings')
          .upsert(rows, { onConflict: 'indicator_id,reading_date' })

        if (upsertError) {
          throw new Error(`Failed to upsert readings: ${upsertError.message}`)
        }
      }

      indicatorsProcessed++
      readingsUpserted += rows.length
    } catch (err) {
      // A single bad indicator (unknown source, unreachable API, bad
      // series code) shouldn't sink the rest of the batch.
      const message = err instanceof Error ? err.message : String(err)
      console.error(
        `fetch-indicators: indicator ${indicator.id} (${indicator.series_code}) failed:`,
        message
      )
      indicatorsFailed.push({
        indicatorId: indicator.id,
        seriesCode: indicator.series_code,
        error: message,
      })
    }
  }

  return { indicatorsProcessed, indicatorsFailed, readingsUpserted }
}
