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
    display?: string
  }>
}) {
  const user = await getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const filters: ArticlesFilters = {
    query: params.q ?? '',
    folderIds: params.folder ? params.folder.split(',').filter(Boolean) : [],
    sourceFeedIds: params.source ? params.source.split(',').filter(Boolean) : [],
    // Cards by default since 2026-10-22 (roadmap R29); ?display=list keeps
    // the list.
    display: params.display === 'list' ? 'list' : 'card',
  }

  const [page, folders, feedOptions, savedCount] = await Promise.all([
    getArticlesPage({
      query: filters.query || undefined,
      folderIds: filters.folderIds,
      sourceFeedIds: filters.sourceFeedIds,
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
        />
      </div>
    </>
  )
}
