import { createClient } from '@supabase/supabase-js'

export interface AutoArchiveSummary {
  dryRun: boolean
  archivedCount: number
}

export interface PurgeContentSummary {
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
