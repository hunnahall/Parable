'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getUser } from '@/lib/supabase/server'
import { runFetchIndicators, fetchSeriesMetadata, type FetchIndicatorsSummary } from './fetch'
import { describeIndicator } from './describe'
import { getComparisonData, type ComparisonSeries, type IndicatorRow } from './data'

// Only FRED is wired up in /api/cron/fetch-indicators today (see the
// comment at the top of that file) — EIA's v2 API needs a real series to
// design against, so it isn't offered here yet even though the schema
// would technically allow it.
export async function addIndicator(input: {
  series_code: string
  display_name?: string
}): Promise<{ indicator: IndicatorRow; error: null } | { indicator: null; error: string }> {
  const user = await getUser()
  if (!user) return { indicator: null, error: 'Not signed in' }

  const series_code = input.series_code.trim()
  let display_name = input.display_name?.trim() || null

  if (!series_code) {
    return { indicator: null, error: 'Series code is required' }
  }

  // Always look up FRED metadata: it fills in the display name when the
  // user left it blank, and its `notes` field feeds describeIndicator()
  // below regardless of whether a display name was already supplied.
  const metadata = await fetchSeriesMetadata(series_code)
  if (!display_name) {
    display_name = metadata?.title ?? series_code
  }
  const description = await describeIndicator(display_name, metadata?.notes ?? null)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('indicators')
    .insert({ source: 'FRED', series_code, display_name, description })
    .select('id, source, series_code, display_name, description')
    .single()

  if (error || !data) return { indicator: null, error: error?.message ?? 'Insert failed' }

  revalidatePath('/indicators')
  // No readings exist for a brand-new indicator yet — the cron job or a
  // manual "Fetch now" populates them afterward.
  return { indicator: { ...data, latest_reading_date: null, recent_readings: [] }, error: null }
}

export async function updateIndicator(
  id: string,
  input: { display_name: string }
): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const display_name = input.display_name.trim()
  if (!display_name) return { error: 'Display name is required' }

  const supabase = await createClient()
  const { error } = await supabase.from('indicators').update({ display_name }).eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/indicators')
  return { error: null }
}

export async function removeIndicator(id: string): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const supabase = await createClient()

  const { error: readingsError } = await supabase
    .from('indicator_readings')
    .delete()
    .eq('indicator_id', id)
  if (readingsError) return { error: readingsError.message }

  const { error } = await supabase.from('indicators').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/indicators')
  revalidatePath('/')
  return { error: null }
}

export async function fetchComparisonData(
  indicatorIds: string[]
): Promise<ComparisonSeries[]> {
  const user = await getUser()
  if (!user) return []

  return getComparisonData(indicatorIds)
}

export async function runFetchIndicatorsNow(): Promise<
  { summary: FetchIndicatorsSummary; error: null } | { summary: null; error: string }
> {
  const user = await getUser()
  if (!user) return { summary: null, error: 'Not signed in' }

  try {
    const summary = await runFetchIndicators(null)
    revalidatePath('/indicators')
    revalidatePath('/')
    return { summary, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { summary: null, error: message }
  }
}
