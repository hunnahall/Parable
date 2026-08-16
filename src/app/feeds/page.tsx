import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { listFeedsDetailed } from '@/lib/feeds/data'
import { listCategories } from '@/lib/categories/data'
import FeedManager from '@/components/feeds/FeedManager'

export default async function FeedsPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const [feeds, categories] = await Promise.all([listFeedsDetailed(), listCategories()])

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Feeds</h1>
      <FeedManager feeds={feeds} categories={categories} />
    </div>
  )
}
