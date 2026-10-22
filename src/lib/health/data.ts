import { cache } from 'react'
import { createClient, getUser } from '@/lib/supabase/server'
import { logQueryError } from '@/lib/supabase/logError'

// Two missed runs at the every-2-hours schedule. Cron has failed silently
// twice before, and an empty Inbox looks the same as a quiet news day.
export const INGEST_STALE_HOURS = 5
// The ingest cron's schedule (supabase/cron.sql), for "next update due".
export const INGEST_INTERVAL_HOURS = 2
// A feed that failed this many runs in a row is broken, not flaky. A feed
// that loads with nothing new doesn't count: ingest only increments
// consecutive_failures when fetching or parsing throws.
export const FEED_FAILING_RUNS = 3

export interface Health {
  // Set when no ingest run has succeeded within INGEST_STALE_HOURS.
  // hoursSince is null when no successful run is recorded at all.
  ingestStale: { hoursSince: number | null } | null
  failingFeeds: { id: string; title: string; failures: number }[]
  // When ingest last succeeded, for the sidebar's status line. Null when
  // no successful run is recorded, or the query failed.
  lastSuccessAt: string | null
}

// Cached per request: the layout (sidebar status line) and the Inbox
// (banners) both read it.
export const getHealth = cache(async (): Promise<Health> => {
  const user = await getUser()
  if (!user) return { ingestStale: null, failingFeeds: [], lastSuccessAt: null }

  const supabase = await createClient()
  const [{ data: run, error: runError }, { data: subs, error: subsError }] = await Promise.all([
    // A run succeeded if it loaded at least one feed, or had nothing to
    // load. One where every feed failed doesn't count.
    supabase
      .from('ingest_runs')
      .select('created_at')
      .or('feeds_processed.gt.0,feeds_failed.eq.0')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('subscriptions')
      .select('title, feeds!inner(id, title, consecutive_failures, deleted_at)')
      .eq('user_id', user.id)
      .gte('feeds.consecutive_failures', FEED_FAILING_RUNS)
      .is('feeds.deleted_at', null),
  ])
  logQueryError('health/getHealth (runs)', runError)
  logQueryError('health/getHealth (feeds)', subsError)

  let ingestStale: Health['ingestStale'] = null
  if (!runError) {
    const lastMs = run?.created_at ? new Date(run.created_at).getTime() : null
    const hoursSince = lastMs === null ? null : (Date.now() - lastMs) / 3_600_000
    if (hoursSince === null || hoursSince >= INGEST_STALE_HOURS) {
      ingestStale = { hoursSince: hoursSince === null ? null : Math.floor(hoursSince) }
    }
  }

  type SubRow = {
    title: string | null
    feeds: { id: string; title: string | null; consecutive_failures: number }
  }
  const failingFeeds = ((subs ?? []) as unknown as SubRow[]).map((sub) => ({
    id: sub.feeds.id,
    title: sub.title ?? sub.feeds.title ?? 'Untitled feed',
    failures: sub.feeds.consecutive_failures,
  }))

  return { ingestStale, failingFeeds, lastSuccessAt: runError ? null : (run?.created_at ?? null) }
})
