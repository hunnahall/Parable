import { NextRequest, NextResponse } from 'next/server'
import { runIngest } from '@/lib/feeds/ingest'
import { isAuthorizedCronRequest } from '@/lib/cron/route'

// Triggered every 4 hours by Supabase Cron (see supabase/cron.sql), which
// calls this deployed route directly — no separate runner involved.
// Not user-facing (see FeedManager's "Run ingest now" for the on-demand,
// user-triggered equivalent) — always run fresh, and force the Node.js
// runtime since rss-parser and the Supabase admin client both need Node
// APIs (this also keeps it off any edge runtime default). maxDuration
// raises the platform's function-timeout ceiling; Fluid Compute is
// confirmed on for this Vercel project, which gives this a real 300s
// budget on the Hobby plan — matches this route's own maxDuration exactly,
// and matches the timeout_milliseconds the Supabase Cron job explicitly
// passes so Postgres doesn't give up waiting before this finishes. A full
// multi-feed cycle can pay for up to two sequential OpenAI calls per new
// item (translate + summarize) at ITEM_CONCURRENCY=5, which the ingest
// pipeline's own comments already flag as ~30s+ even at a modest item
// count — comfortably inside the real budget, but still worth knowing.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

async function handle(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const startedAt = Date.now()
    const summary = await runIngest()
    // Cheapest available signal for "was this run cut short by a platform
    // timeout" — no persisted table for it, just a log line platform logs
    // already capture, checked manually if ingest ever looks incomplete.
    console.log(
      `ingest-feeds: completed in ${Date.now() - startedAt}ms — ` +
        `${summary.feedsProcessed} feeds, ${summary.feedsFailed.length} failed, ` +
        `${summary.itemsInserted} items inserted`
    )
    return NextResponse.json(summary)
  } catch (err) {
    // Only reachable for failures outside the per-feed loop (e.g. the
    // initial `feeds` query itself failing) — per-feed failures are
    // caught above and reported in the response body instead.
    const message = err instanceof Error ? err.message : String(err)
    console.error('ingest-feeds: fatal error', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export { handle as GET, handle as POST }
