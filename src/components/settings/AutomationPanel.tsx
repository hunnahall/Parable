'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { setAutomaticUpdatesPaused } from '@/lib/settings/actions'

// Pause or resume the scheduled jobs: the 2-hourly ingest and the hourly
// retention. One switch for every account, since both are shared jobs.
export default function AutomationPanel({ paused: initialPaused }: { paused: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [paused, setPaused] = useState(initialPaused)
  const [pending, setPending] = useState(false)

  async function toggle() {
    const next = !paused
    setPending(true)
    const result = await setAutomaticUpdatesPaused(next)
    setPending(false)
    if (result.error) {
      toast(`Not ${next ? 'paused' : 'resumed'}. ${result.error}`, 'danger')
      return
    }
    setPaused(next)
    toast(next ? 'Automatic updates paused' : 'Automatic updates resumed')
    router.refresh()
  }

  return (
    <section className="cw-panel">
      <div className="cw-panel__head">
        <h2 className="cw-panel__title">Automatic updates</h2>
        {paused ? <Badge tone="warning">Paused</Badge> : <Badge tone="success">Running</Badge>}
      </div>
      <div className="cw-panel__body flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[52ch] text-sm text-foreground-muted">
          {paused
            ? 'No new articles load and nothing expires until you resume. Refresh on the Inbox still loads new articles. This applies to every account.'
            : 'Parable loads new articles every 2 hours and clears expired ones every hour. Pausing stops both, for every account.'}
        </p>
        <Button variant={paused ? 'primary' : 'secondary'} disabled={pending} onClick={toggle}>
          {pending ? (paused ? 'Resuming' : 'Pausing') : paused ? 'Resume' : 'Pause'}
        </Button>
      </div>
    </section>
  )
}
