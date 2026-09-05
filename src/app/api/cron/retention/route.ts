import { runRetention } from '@/lib/feeds/retention'
import { cronRoute } from '@/lib/cron/route'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const handle = cronRoute('retention', runRetention)

export { handle as GET, handle as POST }
