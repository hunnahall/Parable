import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { getStories } from '@/lib/stories/data'
import { listCategories } from '@/lib/categories/data'
import { listFolderOptions } from '@/lib/folders/data'
import { getHealth } from '@/lib/health/data'
import { listRecentFilteredTitles } from '@/lib/filters/data'
import FilteredToday from '@/components/filters/FilteredToday'
import PageHeader from '@/components/layout/PageHeader'
import HealthBanners from '@/components/health/HealthBanners'
import StoryList from '@/components/stories/StoryList'

export default async function InboxPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const [stories, folders, categories, health, filtered] = await Promise.all([
    getStories('inbox'),
    listFolderOptions(),
    listCategories(),
    getHealth(),
    listRecentFilteredTitles(),
  ])

  return (
    <>
      <PageHeader title="Inbox" count={stories.length} />
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6 min-[1000px]:px-8">
        <HealthBanners health={health} />
        <FilteredToday titles={filtered} />
        <StoryList stories={stories} view="inbox" folders={folders} categories={categories} query="" basePath="/inbox" />
      </div>
    </>
  )
}
