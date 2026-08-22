import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { listIndicatorsDetailed } from '@/lib/indicators/data'
import IndicatorManager from '@/components/indicators/IndicatorManager'

export default async function ManageIndicatorsPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const indicators = await listIndicatorsDetailed()

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="mb-4">Manage Indicators</h1>
      <IndicatorManager indicators={indicators} />
    </div>
  )
}
