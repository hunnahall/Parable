import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { getArticlesPage, listFeeds } from '@/lib/articles/list'
import { listFolderOptions } from '@/lib/folders/data'
import { getHealth } from '@/lib/health/data'
import HealthBanners from '@/components/health/HealthBanners'
import PageHeader from '@/components/layout/PageHeader'
import ArticlesView, { type ArticlesFilters } from '@/components/articles/ArticlesView'

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    folder?: string
    source?: string
    from?: string
    to?: string
    display?: string
  }>
}) {
  const user = await getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const filters: ArticlesFilters = {
    query: params.q ?? '',
    view: 'unfiled',
    folderIds: params.folder ? params.folder.split(',').filter(Boolean) : [],
    sourceFeedIds: params.source ? params.source.split(',').filter(Boolean) : [],
    dateFrom: params.from ?? null,
    dateTo: params.to ?? null,
    display: params.display === 'card' ? 'card' : 'list',
  }

  const [page, folders, feedOptions, health] = await Promise.all([
    getArticlesPage({
      query: filters.query || undefined,
      view: filters.view,
      folderIds: filters.folderIds,
      sourceFeedIds: filters.sourceFeedIds,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    }),
    listFolderOptions(),
    listFeeds(),
    getHealth(),
  ])

  return (
    <>
      <PageHeader title="Inbox" wide={filters.display === 'card'} />
      <div className={filters.display === 'card' ? 'mx-auto max-w-[var(--content-max)] space-y-4 px-4 py-6 min-[1000px]:px-8' : 'mx-auto max-w-3xl space-y-4 px-4 py-6 min-[1000px]:px-8'}>
        <HealthBanners health={health} />
        <ArticlesView
          basePath="/inbox"
          items={page.items}
          nextCursor={page.nextCursor}
          folders={folders}
          feedOptions={feedOptions}
          filters={filters}
          showFolderPicker
          showDateFilters={false}
          enableBulkActions
          collapsibleSummaries
        />
      </div>
    </>
  )
}
