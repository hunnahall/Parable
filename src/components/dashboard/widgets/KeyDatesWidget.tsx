'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import type { KeyDateRow } from '@/lib/keydates/data'
import { addKeyDate, removeKeyDate } from '@/lib/keydates/actions'

// event_date is a plain 'YYYY-MM-DD' date column with no time component —
// parsing it via `new Date(dateString)` reads it as UTC midnight, which
// can display as the previous day in timezones behind UTC. Building the
// Date from its parsed local components sidesteps that entirely.
function formatEventDate(dateString: string): string {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function isPast(dateString: string): boolean {
  return dateString < new Date().toISOString().slice(0, 10)
}

export default function KeyDatesWidget({ items }: { items: KeyDateRow[] }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Optimistic local copy — see TodoWidget.tsx for why: router.refresh()
  // re-runs the whole page's server data, so gating the visible list on it
  // makes adding/removing a date feel laggy whenever anything else on the
  // dashboard is slow to fetch.
  const [localItems, setLocalItems] = useState(items)
  const [syncedFrom, setSyncedFrom] = useState(items)
  if (items !== syncedFrom) {
    setSyncedFrom(items)
    setLocalItems(items)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    const result = await addKeyDate(title, eventDate)
    setPending(false)
    if (result.error !== null) {
      setError(result.error)
      return
    }
    setLocalItems((prev) =>
      [...prev, result.keyDate].sort((a, b) => a.event_date.localeCompare(b.event_date))
    )
    setTitle('')
    setEventDate('')
    router.refresh()
  }

  async function handleRemove(id: string) {
    setLocalItems((prev) => prev.filter((item) => item.id !== id))
    await removeKeyDate(id)
    router.refresh()
  }

  return (
    <div className="space-y-2">
      <form onSubmit={handleAdd} className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Event…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1 min-w-[8rem] border border-border px-2 py-1 text-sm bg-background"
        />
        <input
          type="date"
          value={eventDate}
          onChange={(e) => setEventDate(e.target.value)}
          className="border border-border px-2 py-1 text-sm bg-background"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 bg-foreground text-background px-3 py-1 text-sm transition-colors hover:opacity-90 disabled:opacity-50"
        >
          Add
        </button>
      </form>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {localItems.length === 0 ? (
        <p className="text-sm text-muted">No key dates yet.</p>
      ) : (
        <ul className="space-y-1">
          {localItems.map((item) => (
            <li key={item.id} className="group flex items-center gap-2 text-sm">
              <span
                className={
                  isPast(item.event_date)
                    ? 'shrink-0 text-xs text-muted tabular-nums'
                    : 'shrink-0 text-xs text-accent tabular-nums'
                }
              >
                {formatEventDate(item.event_date)}
              </span>
              <span
                className={
                  isPast(item.event_date)
                    ? 'flex-1 min-w-0 truncate text-muted'
                    : 'flex-1 min-w-0 truncate'
                }
              >
                {item.title}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(item.id)}
                className="shrink-0 text-muted hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100 text-xs"
                aria-label={`Delete key date "${item.title}"`}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
