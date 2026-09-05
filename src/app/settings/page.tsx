import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { getUserPreferences } from '@/lib/preferences/data'
import PageHeader from '@/components/layout/PageHeader'
import SettingsForm from '@/components/settings/SettingsForm'

export default async function SettingsPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const preferences = await getUserPreferences()

  return (
    <>
      <PageHeader title="Settings" />
      <div className="mx-auto max-w-2xl p-6">
        <SettingsForm initialPreferences={preferences} />
      </div>
    </>
  )
}
