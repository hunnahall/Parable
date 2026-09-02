import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import LandingPage from '@/components/landing/LandingPage'

export default async function Home() {
  const user = await getUser()
  if (!user) return <LandingPage />
  redirect('/inbox')
}
