import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component render — safe to ignore since
            // src/proxy.ts refreshes and persists the session on every request.
          }
        },
      },
    }
  )
}

// Wrapped in React.cache so layout.tsx and page.tsx can each call getUser()
// without paying for two round trips to the Supabase Auth server per request.
//
// Deliberately getSession() (reads the JWT from cookies locally), not the
// network-verifying auth.getUser() Supabase's own docs recommend for
// server-side code — that recommendation exists because a page normally
// can't assume its incoming cookies were checked by anything. Here they
// were: src/proxy.ts's middleware matcher covers every route this app
// serves (all but static assets — see its `config.matcher`) and already
// ran the real auth.getUser() network verification, rewriting refreshed
// cookies, before this render ever starts. Re-verifying again here was a
// second ~400ms round trip on every navigation for no additional safety.
// If the middleware matcher is ever narrowed to exclude a route that
// calls this, that route would need its own real auth.getUser() check.
export const getUser = cache(async () => {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.user ?? null
})
