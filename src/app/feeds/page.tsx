import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { listFeedsDetailed } from '@/lib/feeds/data'
import { getEngagementRates } from '@/lib/feeds/engagement'
import { listFolders, listFolderOptions } from '@/lib/folders/data'
import PageHeader from '@/components/layout/PageHeader'
import FeedManager from '@/components/feeds/FeedManager'

export default async function FeedsPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const [feeds, folderOptions, folderRows, engagementRates] = await Promise.all([
    listFeedsDetailed(),
    listFolderOptions(),
    listFolders(),
    getEngagementRates(),
  ])

  return (
    <>
      <PageHeader title="Feeds" count={feeds.length} />
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <FeedManager
          feeds={feeds}
          folders={folderOptions}
          folderRows={folderRows}
          engagement={Object.fromEntries(engagementRates)}
        />
      </div>
    </>
  )
}
