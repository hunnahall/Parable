import { createClient } from '@/lib/supabase/client'

export default function Home() {
  const supabase = createClient()
  return <div>Supabase URL configured: {process.env.NEXT_PUBLIC_SUPABASE_URL ? 'yes' : 'no'}</div>
}
