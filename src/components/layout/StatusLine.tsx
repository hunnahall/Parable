'use client'

import { useEffect, useState } from 'react'

type Tone = 'success' | 'warning' | 'danger'

const DOT: Record<Tone, string> = { success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger' }

function describe(lastSuccessAt: string | null, staleHours: number, now: number): { tone: Tone; text: string } {
  if (!lastSuccessAt) return { tone: 'danger', text: 'No update yet' }
  const minutes = Math.floor(Math.max(0, now - new Date(lastSuccessAt).getTime()) / 60_000)
  const hours = Math.floor(minutes / 60)
  if (hours >= staleHours) return { tone: 'danger', text: `No update in ${hours}h` }
  if (minutes < 1) return { tone: 'success', text: 'Updated just now' }
  return { tone: 'success', text: minutes < 60 ? `Updated ${minutes}m ago` : `Updated ${hours}h ago` }
}

// The sidebar's quiet health line: a dot and when Parable last loaded new
// articles. It turns danger at the same threshold as the Inbox banner, and
// while automatic updates are paused it says so in the warning tone
// instead. Recomputed every minute so an open tab doesn't go stale.
export default function StatusLine({
  lastSuccessAt,
  staleHours,
  paused,
}: {
  lastSuccessAt: string | null
  staleHours: number
  paused: boolean
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const { tone, text } = paused ? { tone: 'warning' as Tone, text: 'Updates paused' } : describe(lastSuccessAt, staleHours, now)

  return (
    <div className="flex items-center gap-2 px-2.5 py-1 font-mono text-2xs text-muted">
      <span className={`size-1.5 shrink-0 rounded-full ${DOT[tone]}`} aria-hidden="true" />
      <span suppressHydrationWarning>{text}</span>
    </div>
  )
}
