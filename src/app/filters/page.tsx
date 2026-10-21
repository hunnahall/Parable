import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { getUserPreferences } from '@/lib/preferences/data'
import PageHeader from '@/components/layout/PageHeader'
import FiltersForm from '@/components/filters/FiltersForm'

export default async function FiltersPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const preferences = await getUserPreferences()

  return (
    <>
      <PageHeader
        title="Filters"
        figure={{ value: preferences.autoDeleteKeywords.length.toLocaleString('en-US'), label: 'Filter words' }}
      />
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 min-[1000px]:px-8">
        <FiltersForm initialPreferences={preferences} />
      </div>
    </>
  )
}
