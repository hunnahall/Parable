import { redirect } from 'next/navigation'
import type { EmailOtpType } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Where Supabase's confirmation emails land. Sign-up was removed from the
// app on 2026-10-20 (accounts are invite-only), but accounts created
// earlier, and the future invite flow, still redeem their token here.
//
// Set the Supabase project's redirect URL to <site>/auth/confirm for this
// to be reachable.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  if (!tokenHash || !type) {
    redirect(`/login?error=${encodeURIComponent('That confirmation link is malformed.')}`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`)
  }

  // verifyOtp sets the session cookies through createClient's setAll, so
  // the user lands signed in rather than back at the login form.
  redirect('/')
}
