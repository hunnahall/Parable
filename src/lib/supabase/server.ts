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

// The signed-in user, from the auth token's verified claims. Wrapped in
// React.cache so the layout and the page share one check per request.
//
// getClaims verifies the token's signature locally against the project's
// ES256 signing keys (fetched once and cached), so this costs no network
// round trip and, unlike getSession(), doesn't trust an unverified cookie.
// The middleware (src/proxy.ts) has already refreshed an expired session
// for this request. Only the id and email are used anywhere.
export interface AppUser {
  id: string
  email: string | null
}

export const getUser = cache(async (): Promise<AppUser | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims?.sub) return null
  return { id: data.claims.sub, email: (data.claims.email as string | undefined) ?? null }
})
