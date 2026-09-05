import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { getArticlesPage, listFeeds } from '@/lib/articles/list'
import { listFolderOptions } from '@/lib/folders/data'
import PageHeader from '@/components/layout/PageHeader'
import ArticlesView, { type ArticlesFilters } from '@/components/articles/ArticlesView'

export default async function ArchivePage({
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
    view: 'archived',
    folderIds: params.folder ? params.folder.split(',').filter(Boolean) : [],
    sourceFeedIds: params.source ? params.source.split(',').filter(Boolean) : [],
    dateFrom: params.from ?? null,
    dateTo: params.to ?? null,
    display: params.display === 'card' ? 'card' : 'list',
  }

  const [page, folders, feedOptions] = await Promise.all([
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
  ])

  return (
    <>
      <PageHeader title="Archive" />
      <div className={filters.display === 'card' ? 'mx-auto max-w-6xl p-6' : 'mx-auto max-w-3xl p-6'}>
        <ArticlesView
          basePath="/archive"
          items={page.items}
          nextCursor={page.nextCursor}
          folders={folders}
          feedOptions={feedOptions}
          filters={filters}
          showDateFilters={false}
          enableBulkActions
        />
      </div>
    </>
  )
}
