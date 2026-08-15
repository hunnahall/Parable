import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { listFeedsDetailed } from '@/lib/feeds/data'
import FeedManager from '@/components/feeds/FeedManager'

export default async function FeedsPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const feeds = await listFeedsDetailed()

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold mb-4">Feeds</h1>
      <FeedManager feeds={feeds} />
    </div>
  )
}
