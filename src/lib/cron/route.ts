import { NextResponse, type NextRequest } from 'next/server'

// Supabase Cron (see supabase/cron.sql) calls the deployed routes over
// plain HTTP, so there's no user session to authenticate against — a
// shared secret is the whole gate. Accepted in a header or a query param
// because pg_net's request builder makes the query form easier for
// one-off manual runs.
export function isAuthorizedCronRequest(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET
  // Fail closed: if the secret isn't configured, nothing can authenticate.
  if (!expected) return false

  const headerSecret = request.headers.get('x-cron-secret')
  const querySecret = request.nextUrl.searchParams.get('secret')

  return headerSecret === expected || querySecret === expected
}

// The three retention routes differ only in which retention function they
// call and what they log, so they share one handler shape: authorize,
// read ?dryRun, run, and turn a throw into a 500 rather than an opaque
// empty-body failure.
export function cronRoute<T>(label: string, run: (options: { dryRun: boolean }) => Promise<T>) {
  return async function handle(request: NextRequest) {
    if (!isAuthorizedCronRequest(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const dryRun = request.nextUrl.searchParams.get('dryRun') === 'true'

    try {
      return NextResponse.json(await run({ dryRun }))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`${label}: fatal error`, message)
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }
}
