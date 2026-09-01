import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { getUserPreferences } from '@/lib/preferences/data'
import FiltersForm from '@/components/filters/FiltersForm'

export default async function FiltersPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const preferences = await getUserPreferences()

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="mb-4">Filters</h1>
      <FiltersForm initialPreferences={preferences} />
    </div>
  )
}
