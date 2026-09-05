'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { SIDEBAR_NAV } from './sidebarNav'

type Command = { id: string; label: string; hint?: string; run: () => void }

// Subsequence match, not substring — "arch" and "acv" both find Archive,
// which is what makes a palette feel like a palette rather than a filter box.
function matches(query: string, label: string): boolean {
  if (!query) return true
  const haystack = label.toLowerCase()
  let i = 0
  for (const ch of query.toLowerCase()) {
    i = haystack.indexOf(ch, i)
    if (i === -1) return false
    i++
  }
  return true
}

export default function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((v) => !v)
        setQuery('')
        setSelected(0)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Built from SIDEBAR_NAV so the palette can never list a destination the
  // sidebar has dropped, or miss one it has gained.
  const commands = useMemo<Command[]>(
    () =>
      SIDEBAR_NAV.filter((e) => e.type === 'link').map((e) => ({
        id: e.href,
        label: e.label,
        hint: 'Go to',
        run: () => router.push(e.href),
      })),
    [router]
  )

  const results = useMemo(
    () => commands.filter((c) => matches(query, c.label)),
    [commands, query]
  )

  function close() {
    setOpen(false)
    setQuery('')
    setSelected(0)
  }

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((i) => (results.length ? (i + 1) % results.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((i) => (results.length ? (i - 1 + results.length) % results.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const command = results[selected]
      if (command) {
        close()
        command.run()
      }
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[55]">
      <div
        className="absolute inset-0 bg-foreground/40 transition-opacity duration-[var(--motion-standard)]"
        onClick={close}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="card-modal absolute left-1/2 top-[20%] w-full max-w-md -translate-x-1/2 overflow-hidden"
      >
        <div className="flex items-center gap-2 border-b border-border-subtle px-3">
          <Search size={14} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelected(0)
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Go to…"
            aria-label="Command"
            className="h-10 flex-1 bg-transparent text-lg placeholder:text-muted focus-visible:outline-none"
          />
        </div>

        {results.length === 0 ? (
          <div className="px-3 py-6 text-center text-base text-muted">No matches.</div>
        ) : (
          <ul className="max-h-72 overflow-y-auto p-1">
            {results.map((c, i) => (
              <li key={c.id}>
                <button
                  type="button"
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => {
                    close()
                    c.run()
                  }}
                  className={
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-base transition-colors ' +
                    (i === selected ? 'bg-foreground/[0.08] text-foreground' : 'text-muted')
                  }
                >
                  {c.hint && <span className="text-sm text-muted">{c.hint}</span>}
                  <span className="text-foreground">{c.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
