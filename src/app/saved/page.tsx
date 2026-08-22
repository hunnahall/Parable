import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { getArticlesPage, listFeeds } from '@/lib/dashboard/data'
import { listFolderOptions } from '@/lib/folders/data'
import { listAllTags } from '@/lib/tags/data'
import ArticlesView, { type ArticlesFilters } from '@/components/articles/ArticlesView'

export default async function SavedPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    folder?: string
    source?: string
    tag?: string
    from?: string
    to?: string
  }>
}) {
  const user = await getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const filters: ArticlesFilters = {
    query: params.q ?? '',
    view: 'saved',
    folderId: params.folder ?? null,
    sourceFeedId: params.source ?? null,
    tag: params.tag ?? null,
    dateFrom: params.from ?? null,
    dateTo: params.to ?? null,
  }

  const [page, folders, feedOptions, allTags] = await Promise.all([
    getArticlesPage({
      query: filters.query || undefined,
      view: filters.view,
      folderId: filters.folderId,
      sourceFeedId: filters.sourceFeedId,
      tag: filters.tag,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    }),
    listFolderOptions(),
    listFeeds(),
    listAllTags(),
  ])

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">Saved</h1>
      <ArticlesView
        basePath="/saved"
        items={page.items}
        nextCursor={page.nextCursor}
        folders={folders}
        feedOptions={feedOptions}
        allTags={allTags.map((t) => t.tag)}
        filters={filters}
        showFolderPicker
        showDelete
      />
    </div>
  )
}
