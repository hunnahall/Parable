'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { runIngestNow } from '@/lib/feeds/actions'

// Loads new articles from the reader's feeds now instead of waiting for the
// next scheduled run (every 2 hours). Works while automatic updates are
// paused. A run reads every feed and the new articles' pages, so it takes
// up to about a minute.
export default function RefreshButton() {
  const router = useRouter()
  const toast = useToast()
  const [running, setRunning] = useState(false)

  async function refresh() {
    setRunning(true)
    const result = await runIngestNow()
    setRunning(false)
    if (result.error !== null) {
      toast(`Not refreshed. ${result.error}`, 'danger')
      return
    }
    const added = result.summary.itemsInserted
    const failed = result.summary.feedsFailed.length
    const parts = [added === 0 ? 'No new articles' : added === 1 ? '1 new article' : `${added} new articles`]
    if (failed > 0) parts.push(`${failed} ${failed === 1 ? 'feed' : 'feeds'} didn't load`)
    toast(parts.join('. '), failed > 0 ? 'danger' : 'default')
    router.refresh()
  }

  return (
    <Button size="sm" disabled={running} onClick={refresh}>
      <RefreshCw strokeWidth={1.5} aria-hidden="true" className={running ? 'motion-safe:animate-spin' : ''} />
      {running ? 'Refreshing' : 'Refresh'}
    </Button>
  )
}
