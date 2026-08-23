import { createClient } from '@supabase/supabase-js'

export interface AutoArchiveSummary {
  dryRun: boolean
  archivedCount: number
}

export interface PurgeContentSummary {
  dryRun: boolean
  purgedCount: number
}

export interface PurgeUnengagedSummary {
  dryRun: boolean
  purgedCount: number
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  )
}

// Sweeps every (user, feed_item) pair older than 48h with no article_states
// row at all into 'archived' — saved articles are untouched since they
// already have a row (state='saved'), so the underlying NOT EXISTS in
// auto_archive_stale_articles() naturally skips them. Purely time-based:
// read state never factors into this, by design (see plan §1.2).
export async function runAutoArchiveArticles(
  opts: { dryRun?: boolean } = {}
): Promise<AutoArchiveSummary> {
  const dryRun = opts.dryRun ?? false

  const supabase = adminClient()
  const { data, error } = await supabase
    .rpc('auto_archive_stale_articles', { dry_run: dryRun })
    .single()

  if (error) throw new Error(`auto_archive_stale_articles failed: ${error.message}`)

  return {
    dryRun,
    archivedCount: Number((data as { archived_count: number }).archived_count),
  }
}

// Deletes cached full-text content (article_content rows) for articles
// archived 7+ days ago, excluding anything any user has saved. Only the
// content cache is touched — feed_items, article_states, tags, folders,
// and summary_ai are untouched, per the "metadata kept forever" rule.
export async function runPurgeArticleContent(
  opts: { dryRun?: boolean } = {}
): Promise<PurgeContentSummary> {
  const dryRun = opts.dryRun ?? false

  const supabase = adminClient()
  const { data, error } = await supabase
    .rpc('purge_expired_article_content', { dry_run: dryRun })
    .single()

  if (error) throw new Error(`purge_expired_article_content failed: ${error.message}`)

  return {
    dryRun,
    purgedCount: Number((data as { purged_count: number }).purged_count),
  }
}

// Hard-deletes feed_items rows published 45+ days ago that were never
// engaged with: not saved, not foldered, not read, and not tagged/noted.
// Saved or foldered articles are never touched by this — they're kept
// forever, full stop. Read/tagged-but-not-saved-or-foldered articles are
// also excluded here; those instead follow the existing archive/content-
// purge rules above (auto-archived after 48h, content cache purged 7
// days later) with their feed_items row kept indefinitely. This is a
// deliberate carve-out from the "metadata kept forever" rule, scoped to
// only the population nobody ever looked at — see
// purge_unengaged_feed_items() in the database.
export async function runPurgeUnengagedFeedItems(
  opts: { dryRun?: boolean } = {}
): Promise<PurgeUnengagedSummary> {
  const dryRun = opts.dryRun ?? false

  const supabase = adminClient()
  const { data, error } = await supabase
    .rpc('purge_unengaged_feed_items', { dry_run: dryRun })
    .single()

  if (error) throw new Error(`purge_unengaged_feed_items failed: ${error.message}`)

  return {
    dryRun,
    purgedCount: Number((data as { purged_count: number }).purged_count),
  }
}
