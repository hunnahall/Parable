import { adminClient, type AdminClient } from '@/lib/supabase/admin'

// One sweep, seven stages, run in order. Splitting them across separate
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
  // Ingest's "already seen this guid" memory, aged out past the window
  // where it could still prevent a re-summarization.
  purgedGuidCount: number
  // Inbox "seen" marks older than 48h, past any story they could dim.
  purgedStoryViewCount: number
  // The filtered-titles log, older than 48h.
  purgedFilteredTitleCount: number
  // Daily article and open counts behind the Feeds page, older than 30 days.
  purgedFeedCountCount: number
}

async function callRetentionRpc(
  supabase: AdminClient,
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
  // Last, and independent of the three above: this table is ingest's
  // memory, not a user's article. It deliberately outlives the feed_items
  // row stage 3 just deleted — that gap is the whole point of it (see the
  // ingested_guids migration).
  const purgedGuidCount = await callRetentionRpc(
    supabase,
    'purge_ingested_guids',
    dryRun,
    'deleted_count'
  )

  const purgedStoryViewCount = await callRetentionRpc(
    supabase,
    'purge_story_views',
    dryRun,
    'deleted_count'
  )

  const purgedFilteredTitleCount = await callRetentionRpc(
    supabase,
    'purge_filtered_titles',
    dryRun,
    'deleted_count'
  )

  const purgedFeedCountCount = await callRetentionRpc(
    supabase,
    'purge_feed_counts',
    dryRun,
    'deleted_count'
  )

  return {
    dryRun,
    staleInboxCount,
    expiredArchivedCount,
    reclaimedCount,
    purgedGuidCount,
    purgedStoryViewCount,
    purgedFilteredTitleCount,
    purgedFeedCountCount,
  }
}
