import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { signInUrl } from '@/lib/suite'

// Signed out, the suite's sign-in page (which comes back here); signed in,
// the Inbox. Parable's own landing page and sign-in were retired when
// sign-in moved to the Covenant Works landing app (2026-11-08).
export default async function Home() {
  const user = await getUser()
  if (!user) redirect(signInUrl())
  redirect('/inbox')
}
