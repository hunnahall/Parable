import { adminClient } from '@/lib/supabase/admin'

export interface RetentionSummary {
  dryRun: boolean
  staleInboxCount: number
  expiredArchivedCount: number
  reclaimedCount: number
  purgedGuidCount: number
  purgedStoryViewCount: number
  purgedFilteredTitleCount: number
  purgedFeedCountCount: number
}

// Parable's whole retention policy:
//
//   1. An article you never touch is deleted 12h after it arrives.
//   2. An article you archive is deleted 24h after you archive it.
//   3. A shared feed_items row is reclaimed once nobody wants it.
//   4. Ingest's record of which guids it has already seen ages out at 72h.
//   5. A reader's "seen" mark on a story ages out at 48h.
//   6. The log of titles a reader's filters removed ages out at 48h.
//   7. The Feeds page's daily counts age out at 30 days.
//
// Both windows are measured from when Parable first saw the article
// (feed_items.created_at), not from its own publish date — a feed that
// publishes with a lag, or backfills, would otherwise deliver articles
// already past their window and have them swept before anyone saw them.
//
// Stages 1 and 2 write per-user 'deleted' tombstones rather than touching
// the shared row: your retention window is yours, and another subscriber
// may have saved the same article. Stage 3 is the only thing that deletes
// a shared row, and only once every subscriber has let go of it.
//
// The stages run in order inside public.run_retention(), which pg_cron
// calls hourly in the database (see the run_retention_in_database
// migration). This is what /api/cron/retention runs, kept for manual and
// ?dryRun=true runs.
export async function runRetention(opts: { dryRun?: boolean } = {}): Promise<RetentionSummary> {
  const { data, error } = await adminClient().rpc('run_retention', { dry_run: opts.dryRun ?? false })
  if (error) throw new Error(`run_retention failed: ${error.message}`)
  return data as RetentionSummary
}
