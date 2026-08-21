import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { getUserPreferences } from '@/lib/preferences/data'
import SettingsForm from '@/components/settings/SettingsForm'

export default async function SettingsPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const preferences = await getUserPreferences()

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">Settings</h1>
      <SettingsForm initialPreferences={preferences} />
    </div>
  )
}
