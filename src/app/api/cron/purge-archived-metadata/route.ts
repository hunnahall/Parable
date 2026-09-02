import { NextRequest, NextResponse } from 'next/server'
import { runPurgeArchivedArticleMetadata } from '@/lib/feeds/retention'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false

  const headerSecret = request.headers.get('x-cron-secret')
  const querySecret = request.nextUrl.searchParams.get('secret')

  return headerSecret === expected || querySecret === expected
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dryRun = request.nextUrl.searchParams.get('dryRun') === 'true'

  try {
    const summary = await runPurgeArchivedArticleMetadata({ dryRun })
    return NextResponse.json(summary)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('purge-archived-metadata: fatal error', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export { handle as GET, handle as POST }
