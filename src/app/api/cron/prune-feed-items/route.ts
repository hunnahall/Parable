import { NextRequest, NextResponse } from 'next/server'
import { runPruneFeedItems } from '@/lib/feeds/retention'

// Cron-triggered background job, not user-facing — same reasoning as
// /api/ingest-feeds and /api/cron/fetch-indicators: always run fresh,
// force the Node.js runtime.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

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

  // ?dryRun=true reports how many rows would be deleted without deleting
  // them — meant for verifying the saved-article exclusion is correct
  // before this route is ever wired into a real schedule, since the
  // delete itself has no undo.
  const dryRun = request.nextUrl.searchParams.get('dryRun') === 'true'

  try {
    const summary = await runPruneFeedItems({ dryRun })
    return NextResponse.json(summary)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('prune-feed-items: fatal error', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export { handle as GET, handle as POST }
