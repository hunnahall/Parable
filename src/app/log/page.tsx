import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { listFeedsDetailed } from '@/lib/feeds/data'
import FeedSyncLog from '@/components/feeds/FeedSyncLog'

export default async function LogPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const feeds = await listFeedsDetailed()

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <h1>Log</h1>
      <FeedSyncLog feeds={feeds} />
    </div>
  )
}
