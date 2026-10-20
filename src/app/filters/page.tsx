import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { getUserPreferences } from '@/lib/preferences/data'
import { listFilterRules } from '@/lib/filters/rules'
import { listFolderOptions } from '@/lib/folders/data'
import PageHeader from '@/components/layout/PageHeader'
import FiltersForm from '@/components/filters/FiltersForm'
import RulesBlock from '@/components/filters/RulesBlock'

export default async function FiltersPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const [preferences, rules, folders] = await Promise.all([
    getUserPreferences(),
    listFilterRules(),
    listFolderOptions(),
  ])

  return (
    <>
      <PageHeader title="Filters" />
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 min-[1000px]:px-8">
        <FiltersForm initialPreferences={preferences} />
        <RulesBlock rules={rules} folders={folders} />
      </div>
    </>
  )
}
