import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { getStories } from '@/lib/stories/data'
import { listFolderOptions } from '@/lib/folders/data'
import { listCategories } from '@/lib/categories/data'
import PageHeader from '@/components/layout/PageHeader'
import StoryList from '@/components/stories/StoryList'

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const user = await getUser()
  if (!user) redirect('/login')

  const { q = '' } = await searchParams
  const [stories, folders, categories] = await Promise.all([
    getStories('archive', q),
    listFolderOptions(),
    listCategories(),
  ])

  return (
    <>
      <PageHeader
        title="Archive"
        figure={{ value: stories.length.toLocaleString('en-US'), label: q ? 'Matching stories' : 'Stories, kept 24 hours' }}
      />
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6 min-[1000px]:px-8">
        <StoryList stories={stories} view="archive" folders={folders} categories={categories} query={q} basePath="/archive" />
      </div>
    </>
  )
}
