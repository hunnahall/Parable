import { createClient } from '@supabase/supabase-js'

export interface AutoArchiveSummary {
  dryRun: boolean
  archivedCount: number
}

export interface PurgeContentSummary {
  dryRun: boolean
  purgedCount: number
}

export interface PurgeArchivedMetadataSummary {
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

// Sweeps every (user, feed_item) pair older than 24h with no article_states
// row at all into 'archived' — saved/reading articles are untouched since
// they already have a row (state='saved'/'reading'), so the underlying NOT
// EXISTS in auto_archive_stale_articles() naturally skips them. Purely
// time-based: read state never factors into this, by design.
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
// archived 7+ days ago, excluding anything any user has saved or is
// reading. Only the content cache is touched — feed_items, article_states,
// tags, folders, and summary_ai are untouched here.
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

// Hard-deletes feed_items rows for articles that have sat in Archive 30+
// days — cascades to that article's article_states/article_content/
// article_folders/read_items for every user. Items in Read or Save are
// never touched by this: state 'saved' or 'reading' is a hard exemption,
// unconditionally, regardless of any note or read history on an otherwise-
// eligible archived article. This is the app's only long-term bound on
// feed_items storage growth — see purge_archived_article_metadata() in the
// database.
export async function runPurgeArchivedArticleMetadata(
  opts: { dryRun?: boolean } = {}
): Promise<PurgeArchivedMetadataSummary> {
  const dryRun = opts.dryRun ?? false

  const supabase = adminClient()
  const { data, error } = await supabase
    .rpc('purge_archived_article_metadata', { dry_run: dryRun })
    .single()

  if (error) throw new Error(`purge_archived_article_metadata failed: ${error.message}`)

  return {
    dryRun,
    purgedCount: Number((data as { purged_count: number }).purged_count),
  }
}
