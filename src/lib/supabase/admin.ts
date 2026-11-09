import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { DB_SCHEMA } from './schema'

// Service-role client: bypasses RLS. Used only on the server, for writes no
// signed-in user may make directly: the shared feed catalog (feeds,
// feed_items), ingest, and retention. Never import this from a client
// component; SUPABASE_SECRET_KEY isn't exposed to the browser bundle.
// Untyped tables (`any`), as before, but bound to Parable's schema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AdminClient = SupabaseClient<any, typeof DB_SCHEMA>

export function adminClient(): AdminClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { db: { schema: DB_SCHEMA }, auth: { persistSession: false } }
  )
}
