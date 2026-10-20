import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Service-role client: bypasses RLS. Used only on the server, for writes no
// signed-in user may make directly: the shared feed catalog (feeds,
// feed_items), ingest, and retention. Never import this from a client
// component; SUPABASE_SECRET_KEY isn't exposed to the browser bundle.
export type AdminClient = SupabaseClient

export function adminClient(): AdminClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  )
}
