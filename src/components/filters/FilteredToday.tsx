'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import type { FilteredTitle } from '@/lib/filters/data'

// "N filtered today" under the Inbox banners, expanding to the titles and
// the word that removed each. Today is the reader's local day, so the
// count is worked out here in the browser.
export default function FilteredToday({ titles }: { titles: FilteredTitle[] }) {
  const [open, setOpen] = useState(false)
  const [midnight] = useState(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  })

  const today = titles.filter((t) => new Date(t.filteredAt).getTime() >= midnight)
  if (today.length === 0) return null

  return (
    <div className="text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-muted hover:text-foreground"
        suppressHydrationWarning
      >
        <span className="tabular-nums">{today.length}</span> filtered today
        <ChevronDown
          size={14}
          strokeWidth={1.5}
          aria-hidden="true"
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="mt-2 space-y-2 border-l border-border pl-3">
          <ul className="space-y-1">
            {today.map((t) => (
              <li key={t.id}>
                <span className="text-xs text-muted">
                  {[t.feedTitle, `“${t.keyword}”`].filter(Boolean).join(' · ')} ·{' '}
                </span>
                {t.link ? (
                  <a href={t.link} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
                    {t.title}
                  </a>
                ) : (
                  t.title
                )}
              </li>
            ))}
          </ul>
          <Link href="/filters" className="text-xs text-muted underline-offset-4 hover:underline">
            Edit filtered words
          </Link>
        </div>
      )}
    </div>
  )
}
