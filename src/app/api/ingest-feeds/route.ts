import { NextRequest, NextResponse } from 'next/server'
import { runIngest } from '@/lib/feeds/ingest'

// Cron-triggered background job, not user-facing — always run fresh,
// and force the Node.js runtime since rss-parser and the Supabase admin
// client both need Node APIs (this also keeps it off any edge runtime
// default). maxDuration raises the platform's function-timeout ceiling
// (it does NOT guarantee this much runtime on every plan/tier — Vercel
// Hobby still caps at 10s regardless) — a full multi-feed cycle can pay
// for up to two sequential OpenAI calls per new item (translate +
// summarize) at ITEM_CONCURRENCY=5, which the ingest pipeline's own
// comments already flag as ~30s+ even at a modest item count.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET
  // Fail closed: if the secret isn't configured, nothing can authenticate.
  if (!expected) return false

  const headerSecret = request.headers.get('x-cron-secret')
  const querySecret = request.nextUrl.searchParams.get('secret')

  return headerSecret === expected || querySecret === expected
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
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
