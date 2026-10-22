import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { getStories } from '@/lib/stories/data'
import { listCategories } from '@/lib/categories/data'
import { listFolderOptions } from '@/lib/folders/data'
import { getHealth, INGEST_INTERVAL_HOURS } from '@/lib/health/data'
import { getUserPreferences } from '@/lib/preferences/data'
import InboxViewSwitch from '@/components/stories/InboxViewSwitch'
import RefreshButton from '@/components/stories/RefreshButton'
import { listRecentFilteredTitles } from '@/lib/filters/data'
import FilteredToday from '@/components/filters/FilteredToday'
import PageHeader from '@/components/layout/PageHeader'
import HealthBanners from '@/components/health/HealthBanners'
import StoryList from '@/components/stories/StoryList'

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const user = await getUser()
  if (!user) redirect('/login')

  const params = await searchParams

  const [stories, folders, categories, health, filtered, prefs] = await Promise.all([
    getStories('inbox'),
    listFolderOptions(),
    listCategories(),
    getHealth(),
    listRecentFilteredTitles(),
    getUserPreferences(),
  ])

  // An empty Inbox says whether it was cleared (and when more is due) or
  // simply has nothing yet. Only read when it's empty.
  const inboxClear =
    stories.length === 0
      ? {
          archivedCount: (await getStories('archive')).length,
          nextUpdateAt: health.lastSuccessAt
            ? new Date(new Date(health.lastSuccessAt).getTime() + INGEST_INTERVAL_HOURS * 3_600_000).toISOString()
            : null,
        }
      : null

  // ?category=<id> shows one category's section (the sidebar's category
  // links). An id that isn't one of the user's categories shows everything.
  const category = categories.find((c) => c.id === params.category)
  // The front page is an All-view layout; a category's view is always a list.
  const front = prefs.inboxView === 'front' && !category
  const shown = category ? stories.filter((story) => story.sources.some((s) => s.categoryId === category.id)) : stories

  return (
    <>
      <PageHeader
        title={category?.name ?? 'Inbox'}
        wide={front}
        wideFrom1280={!front}
        actions={
          <>
            <RefreshButton />
            {!category && <InboxViewSwitch initial={prefs.inboxView} />}
          </>
        }
        figure={{ value: shown.length.toLocaleString('en-US'), label: 'Stories, last 12 hours' }}
      />
      {/* The front page uses the wide content width; the list goes full width at 1280px for the reading pane. */}
      <div
        className={`mx-auto max-w-3xl space-y-4 px-4 py-6 min-[1000px]:px-8 ${front ? 'min-[1000px]:max-w-[var(--content-max)]' : 'min-[1280px]:max-w-none'}`}
      >
        <HealthBanners health={health} />
        <FilteredToday titles={filtered} />
        <StoryList
          stories={stories}
          view="inbox"
          folders={folders}
          categories={categories}
          categoryId={category?.id ?? null}
          filteredTitles={filtered}
          inboxClear={inboxClear}
          inboxView={prefs.inboxView}
          query=""
          basePath="/inbox"
        />
      </div>
    </>
  )
}
