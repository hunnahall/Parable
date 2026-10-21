'use client'

import { useEffect, useState } from 'react'

function describe(lastSuccessAt: string | null, staleHours: number, now: number): { ok: boolean; text: string } {
  if (!lastSuccessAt) return { ok: false, text: 'No update yet' }
  const minutes = Math.floor(Math.max(0, now - new Date(lastSuccessAt).getTime()) / 60_000)
  const hours = Math.floor(minutes / 60)
  if (hours >= staleHours) return { ok: false, text: `No update in ${hours}h` }
  if (minutes < 1) return { ok: true, text: 'Updated just now' }
  return { ok: true, text: minutes < 60 ? `Updated ${minutes}m ago` : `Updated ${hours}h ago` }
}

// The sidebar's quiet health line: a dot and when Parable last loaded new
// articles. It turns danger at the same threshold as the Inbox banner.
// Recomputed every minute so an open tab doesn't go stale.
export default function StatusLine({ lastSuccessAt, staleHours }: { lastSuccessAt: string | null; staleHours: number }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const { ok, text } = describe(lastSuccessAt, staleHours, now)

  return (
    <div className="flex items-center gap-2 px-2.5 py-1 font-mono text-2xs text-muted">
      <span className={`size-1.5 shrink-0 rounded-full ${ok ? 'bg-success' : 'bg-danger'}`} aria-hidden="true" />
      <span suppressHydrationWarning>{text}</span>
    </div>
  )
}
