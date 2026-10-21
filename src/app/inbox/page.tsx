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

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const user = await getUser()
  if (!user) redirect('/login')

  const params = await searchParams

  const [stories, folders, categories, health, filtered] = await Promise.all([
    getStories('inbox'),
    listFolderOptions(),
    listCategories(),
    getHealth(),
    listRecentFilteredTitles(),
  ])

  // ?category=<id> shows one category's section (the sidebar's category
  // links). An id that isn't one of the user's categories shows everything.
  const category = categories.find((c) => c.id === params.category)
  const shown = category ? stories.filter((story) => story.sources.some((s) => s.categoryId === category.id)) : stories

  return (
    <>
      <PageHeader
        title={category?.name ?? 'Inbox'}
        wideFrom1280
        figure={{ value: shown.length.toLocaleString('en-US'), label: 'Stories, last 12 hours' }}
      />
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6 min-[1000px]:px-8 min-[1280px]:max-w-none">
        <HealthBanners health={health} />
        <FilteredToday titles={filtered} />
        <StoryList
          stories={stories}
          view="inbox"
          folders={folders}
          categories={categories}
          categoryId={category?.id ?? null}
          filteredTitles={filtered}
          query=""
          basePath="/inbox"
        />
      </div>
    </>
  )
}
