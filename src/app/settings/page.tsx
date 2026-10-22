import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { getUserPreferences } from '@/lib/preferences/data'
import { getRecentUsage, getSpendHistory } from '@/lib/usage/data'
import { getAutomationState } from '@/lib/settings/automation'
import { formatUsd, USAGE_WINDOW_DAYS } from '@/lib/usage/tokens'
import PageHeader from '@/components/layout/PageHeader'
import SettingsForm from '@/components/settings/SettingsForm'

export default async function SettingsPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const [preferences, usage, spend, automation] = await Promise.all([
    getUserPreferences(),
    getRecentUsage(),
    getSpendHistory(),
    getAutomationState(),
  ])

  return (
    <>
      <PageHeader
        title="Settings"
        figure={{ value: formatUsd(usage?.estimatedUsd ?? 0), label: `API spend, ${USAGE_WINDOW_DAYS} days` }}
      />
      <div className="mx-auto max-w-3xl px-4 py-6 min-[1000px]:px-8">
        <SettingsForm initialPreferences={preferences} usage={usage} spend={spend} paused={automation.paused} />
      </div>
    </>
  )
}
