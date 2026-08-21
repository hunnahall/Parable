import { createClient } from '@supabase/supabase-js'

const DEFAULT_CUTOFF_DAYS = 14

export interface PruneSummary {
  cutoffDays: number
  dryRun: boolean
  deletedCount: number
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  )
}

// Deletes feed_items older than cutoffDays, except any article a user has
// saved — article_states.feed_item_id cascades on delete, so pruning a
// saved article's row would silently destroy its note/tags too. The
// exclusion lives in prune_feed_items() itself (a WHERE NOT EXISTS against
// article_states), not here, since supabase-js's delete builder can't
// express a correlated subquery safely (only `.not('id','in',[...])`
// against a materialized id list, which reintroduces the NOT IN/NULL
// footgun this avoids).
export async function runPruneFeedItems(
  opts: { dryRun?: boolean; cutoffDays?: number } = {}
): Promise<PruneSummary> {
  const dryRun = opts.dryRun ?? false
  const cutoffDays = opts.cutoffDays ?? DEFAULT_CUTOFF_DAYS

  const supabase = adminClient()
  const { data, error } = await supabase
    .rpc('prune_feed_items', { cutoff_days: cutoffDays, dry_run: dryRun })
    .single()

  if (error) throw new Error(`prune_feed_items failed: ${error.message}`)

  return {
    cutoffDays,
    dryRun,
    deletedCount: Number((data as { deleted_count: number }).deleted_count),
  }
}
