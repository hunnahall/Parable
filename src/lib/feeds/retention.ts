import { createClient } from '@supabase/supabase-js'

// One sweep, three stages, run in order. Splitting them across separate
// cron jobs the way the old 24h/7d/30d policy did buys nothing at these
// windows — the stages are sub-second queries and the later ones want the
// earlier ones' output, so ordering them explicitly here is both simpler
// and more correct than hoping three schedules interleave the right way.
export interface RetentionSummary {
  dryRun: boolean
  // Inbox articles that aged past 12h without being saved or archived.
  staleInboxCount: number
  // Archived articles that aged past a further 24h.
  expiredArchivedCount: number
  // Shared feed_items rows nobody wants anymore, hard-deleted.
  reclaimedCount: number
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  )
}

async function callRetentionRpc(
  supabase: ReturnType<typeof adminClient>,
  fn: string,
  dryRun: boolean,
  field: string
): Promise<number> {
  const { data, error } = await supabase.rpc(fn, { dry_run: dryRun }).single()
  if (error) throw new Error(`${fn} failed: ${error.message}`)
  return Number((data as Record<string, number>)[field])
}

// Parable's whole retention policy:
//
//   1. An article you never touch is deleted 12h after it arrives.
//   2. An article you archive is deleted 24h after you archive it.
//   3. A shared feed_items row is reclaimed once nobody wants it.
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
export async function runRetention(
  opts: { dryRun?: boolean } = {}
): Promise<RetentionSummary> {
  const dryRun = opts.dryRun ?? false
  const supabase = adminClient()

  const staleInboxCount = await callRetentionRpc(
    supabase,
    'purge_stale_inbox_articles',
    dryRun,
    'deleted_count'
  )
  const expiredArchivedCount = await callRetentionRpc(
    supabase,
    'purge_expired_archived_articles',
    dryRun,
    'deleted_count'
  )
  const reclaimedCount = await callRetentionRpc(
    supabase,
    'reclaim_orphaned_feed_items',
    dryRun,
    'reclaimed_count'
  )

  return { dryRun, staleInboxCount, expiredArchivedCount, reclaimedCount }
}
