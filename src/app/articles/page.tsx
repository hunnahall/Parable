import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { getArticlesPage, listSavedTags } from '@/lib/dashboard/data'
import { listCategories } from '@/lib/categories/data'
import ArticlesView from '@/components/articles/ArticlesView'

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; tag?: string; saved?: string }>
}) {
  const user = await getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const filters = {
    query: params.q ?? '',
    category: params.category ?? null,
    tag: params.tag ?? null,
    savedOnly: params.saved === '1',
  }

  const [page, categories, savedTags] = await Promise.all([
    getArticlesPage({
      query: filters.query || undefined,
      category: filters.category,
      tag: filters.tag,
      savedOnly: filters.savedOnly,
    }),
    listCategories(),
    listSavedTags(),
  ])

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">Articles</h1>
      <ArticlesView
        items={page.items}
        nextCursor={page.nextCursor}
        categories={categories}
        savedTags={savedTags}
        filters={filters}
      />
    </div>
  )
}
