import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { listIndicatorDashboardWidgets } from '@/lib/indicators/dashboard'
import IndicatorsDashboard from '@/components/indicators/IndicatorsDashboard'

export default async function IndicatorsPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const { widgets, availableToAdd } = await listIndicatorDashboardWidgets()

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="mb-6">Indicators</h1>
      <IndicatorsDashboard initialWidgets={widgets} availableToAdd={availableToAdd} />
    </div>
  )
}
