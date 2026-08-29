import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { listFeedsDetailed } from '@/lib/feeds/data'
import { getEngagementRates } from '@/lib/feeds/engagement'
import { listFolders, listFolderOptions } from '@/lib/folders/data'
import { listAllTags } from '@/lib/tags/data'
import FeedManager from '@/components/feeds/FeedManager'

export default async function FeedsPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const [feeds, folderOptions, folderRows, engagementRates, tags] = await Promise.all([
    listFeedsDetailed(),
    listFolderOptions(),
    listFolders(),
    getEngagementRates(),
    listAllTags(),
  ])

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <h1>Feeds</h1>
      <FeedManager
        feeds={feeds}
        folders={folderOptions}
        folderRows={folderRows}
        engagement={Object.fromEntries(engagementRates)}
        tags={tags}
      />
    </div>
  )
}
