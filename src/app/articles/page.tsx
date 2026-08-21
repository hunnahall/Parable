import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { getSavedArticlesData } from '@/lib/dashboard/data'
import SavedArticlesView from '@/components/articles/SavedArticlesView'

export default async function ArticlesPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const items = await getSavedArticlesData()

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">Articles</h1>
      <SavedArticlesView items={items} />
    </div>
  )
}
