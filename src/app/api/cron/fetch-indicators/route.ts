import { NextRequest, NextResponse } from 'next/server'
import { runFetchIndicators } from '@/lib/indicators/fetch'

// Cron-triggered background job, not user-facing — same reasoning as
// /api/ingest-feeds: always run fresh, force the Node.js runtime.
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

  // Optional ?series=<series_code> narrows the run to a single indicator —
  // meant for manual testing against one series without pulling all of
  // them; the cron trigger just omits it.
  const seriesFilter = request.nextUrl.searchParams.get('series')

  try {
    const summary = await runFetchIndicators(seriesFilter)
    return NextResponse.json(summary)
  } catch (err) {
    // Only reachable for failures outside the per-indicator loop (e.g.
    // the initial `indicators` query itself failing) — per-indicator
    // failures are caught above and reported in the response body
    // instead.
    const message = err instanceof Error ? err.message : String(err)
    console.error('fetch-indicators: fatal error', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export { handle as GET, handle as POST }
