import { redirect } from 'next/navigation'
import type { EmailOtpType } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Where Supabase's confirmation emails land. signup() in
// src/app/login/actions.ts tells the user to check their email whenever
// signUp returns no session, but until this route existed the link in that
// email had nowhere in the app to redeem its token — the account stayed
// unconfirmed and could never sign in.
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
