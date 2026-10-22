import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// This middleware sits in front of every request the app serves, so a
// stalled Auth server would otherwise hang each one until the platform's
// own execution limit kills the function. Every other outbound call in
// the project already bounds itself (see AbortSignal.timeout in
// src/lib/feeds/ingest.ts and the AbortControllers in
// src/lib/articles/extract.ts); this is the one that runs on every page
// view, so it needs it most.
const AUTH_TIMEOUT_MS = 3_000

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(AUTH_TIMEOUT_MS) }),
      },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Verifies the auth token and rewrites refreshed cookies onto the
  // response. Server Components can only read cookies, not write them, so
  // this is the one place a refreshed token actually gets persisted back to
  // the browser.
  //
  // getClaims checks the token's signature locally against the project's
  // ES256 signing keys (fetched once and cached), instead of getUser's
  // round trip to the Auth server on every request (about 70ms before the
  // server does any work; 2026-10-22). It still refreshes an expired
  // session. The trade-off: a session revoked elsewhere stays valid until
  // its token expires (an hour at most).
  //
  // Fail open: a slow/unreachable Auth server shouldn't hang or break every
  // request on this matcher (effectively the whole app). Between the
  // AUTH_TIMEOUT_MS abort above and this catch, both a hang and a throw
  // end the same way — skip the refresh for this request and pass the
  // existing cookies through unmodified rather than blocking the response.
  try {
    await supabase.auth.getClaims()
  } catch (err) {
    console.error('proxy: auth.getClaims failed', err)
  }

  return supabaseResponse
}

// Covers every route but static assets, so an expired session is refreshed
// before any page renders. Pages verify the token themselves
// (src/lib/supabase/server.ts getUser), so narrowing this only means a route
// may see a just-expired session as signed out until the next request.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
