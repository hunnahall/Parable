import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { listFeedsDetailed } from '@/lib/feeds/data'
import { getFeedNumbers } from '@/lib/feeds/numbers'
import { listCategories } from '@/lib/categories/data'
import { listFolders } from '@/lib/folders/data'
import PageHeader from '@/components/layout/PageHeader'
import FeedManager from '@/components/feeds/FeedManager'

export default async function FeedsPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const [feeds, categories, folderRows, numbers] = await Promise.all([
    listFeedsDetailed(),
    listCategories(),
    listFolders(),
    getFeedNumbers(),
  ])

  return (
    <>
      <PageHeader title="Feeds" count={feeds.length} />
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 min-[1000px]:px-8">
        <FeedManager
          feeds={feeds}
          categories={categories}
          folderRows={folderRows}
          numbers={Object.fromEntries(numbers)}
        />
      </div>
    </>
  )
}
