import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { getArticlesPage, listFeeds } from '@/lib/articles/list'
import { listFolderOptions } from '@/lib/folders/data'
import { countSavedArticles } from '@/lib/articles/count'
import PageHeader from '@/components/layout/PageHeader'
import ArticlesView, { type ArticlesFilters } from '@/components/articles/ArticlesView'

export default async function SavedPage({
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
    view: 'saved',
    folderIds: params.folder ? params.folder.split(',').filter(Boolean) : [],
    sourceFeedIds: params.source ? params.source.split(',').filter(Boolean) : [],
    dateFrom: params.from ?? null,
    dateTo: params.to ?? null,
    display: params.display === 'card' ? 'card' : 'list',
  }

  const [page, folders, feedOptions, savedCount] = await Promise.all([
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
    countSavedArticles(),
  ])

  return (
    <>
      <PageHeader
        title="Saved"
        wide={filters.display === 'card'}
        figure={{ value: savedCount.toLocaleString('en-US'), label: 'Saved articles' }}
      />
      <div className={filters.display === 'card' ? 'mx-auto max-w-[var(--content-max)] px-4 py-6 min-[1000px]:px-8' : 'mx-auto max-w-3xl px-4 py-6 min-[1000px]:px-8'}>
        <ArticlesView
          basePath="/saved"
          items={page.items}
          nextCursor={page.nextCursor}
          folders={folders}
          feedOptions={feedOptions}
          filters={filters}
          showFolderPicker
          showDelete
          showDateFilters={false}
          enableBulkActions
        />
      </div>
    </>
  )
}
