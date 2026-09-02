import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { getArticlesPage, listFeeds } from '@/lib/dashboard/data'
import { listFolderOptions } from '@/lib/folders/data'
import { listAllTags } from '@/lib/tags/data'
import ArticlesView, { type ArticlesFilters } from '@/components/articles/ArticlesView'

export default async function ReadPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    folder?: string
    source?: string
    tags?: string
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
    view: 'reading',
    folderIds: params.folder ? params.folder.split(',').filter(Boolean) : [],
    sourceFeedIds: params.source ? params.source.split(',').filter(Boolean) : [],
    tagIds: params.tags ? params.tags.split(',').filter(Boolean) : [],
    dateFrom: params.from ?? null,
    dateTo: params.to ?? null,
    display: params.display === 'card' ? 'card' : 'list',
  }

  const [page, folders, feedOptions, allTags] = await Promise.all([
    getArticlesPage({
      query: filters.query || undefined,
      view: filters.view,
      folderIds: filters.folderIds,
      sourceFeedIds: filters.sourceFeedIds,
      tagIds: filters.tagIds,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    }),
    listFolderOptions(),
    listFeeds(),
    listAllTags(),
  ])

  return (
    <div className={filters.display === 'card' ? 'p-8 max-w-6xl mx-auto' : 'p-8 max-w-3xl mx-auto'}>
      <h1 className="mb-4">Read</h1>
      <ArticlesView
        basePath="/read"
        items={page.items}
        nextCursor={page.nextCursor}
        folders={folders}
        feedOptions={feedOptions}
        allTags={allTags.map((t) => t.tag)}
        filters={filters}
        showFolderPicker
        showDateFilters={false}
        showTagsDropdown
        enableBulkActions
      />
    </div>
  )
}
