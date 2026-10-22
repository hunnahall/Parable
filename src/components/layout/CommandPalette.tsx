'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Archive, Hash, Monitor, Moon, Plus, Search, Sun, type LucideIcon } from 'lucide-react'
import { NAV_LINKS, categoryHref, type SidebarCategory } from './sidebarNav'
import { updatePreferences } from '@/lib/preferences/actions'
import { applyTheme } from '@/lib/preferences/applyTheme'
import type { ThemeChoice } from '@/lib/preferences/data'

// Dispatched by the sidebar's Search button, so touch screens (no ⌘K)
// reach the same palette.
export const PALETTE_OPEN_EVENT = 'parable:open-palette'
// Dispatched by the palette's Archive all; the Inbox's StoryList listens.
export const ARCHIVE_ALL_EVENT = 'parable:archive-all'

type Command = { id: string; label: string; group: string; icon: LucideIcon; run: () => void }

// Subsequence match, not substring: "arch" and "acv" both find Archive.
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

const THEMES: { value: ThemeChoice; label: string; icon: LucideIcon }[] = [
  { value: 'system', label: 'Use device theme', icon: Monitor },
  { value: 'dark', label: 'Use dark theme', icon: Moon },
  { value: 'light', label: 'Use light theme', icon: Sun },
]

export default function CommandPalette({ categories }: { categories: SidebarCategory[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function reset() {
      setQuery('')
      setSelected(0)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((v) => !v)
        reset()
      }
    }
    function onOpen() {
      setOpen(true)
      reset()
    }
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener(PALETTE_OPEN_EVENT, onOpen)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener(PALETTE_OPEN_EVENT, onOpen)
    }
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Built from SIDEBAR_NAV so the palette can never list a destination the
  // sidebar has dropped, or miss one it has gained. Settings is listed here
  // though the sidebar keeps it in the account menu.
  const commands = useMemo<Command[]>(
    () => [
      ...NAV_LINKS.map((e) => ({ id: e.href, label: e.label, group: 'Go to', icon: e.icon, run: () => router.push(e.href) })),
      ...categories.map((c) => ({
        id: `category-${c.id}`,
        label: c.name,
        group: 'Categories',
        icon: Hash,
        run: () => router.push(categoryHref(c.id)),
      })),
      // Archive all works on what the Inbox has on screen, so it's offered
      // only there.
      ...(pathname === '/inbox'
        ? [
            {
              id: 'archive-all',
              label: 'Archive all',
              group: 'Actions',
              icon: Archive,
              run: () => window.dispatchEvent(new Event(ARCHIVE_ALL_EVENT)),
            },
          ]
        : []),
      {
        id: 'add-feed',
        label: 'Add a feed',
        group: 'Actions',
        icon: Plus,
        run: () => router.push('/feeds#new-feed-url'),
      },
      ...THEMES.map((t) => ({
        id: `theme-${t.value}`,
        label: t.label,
        group: 'Theme',
        icon: t.icon,
        run: () => {
          applyTheme(t.value)
          void updatePreferences({ theme: t.value })
        },
      })),
    ],
    [router, categories, pathname]
  )

  const results = useMemo(() => commands.filter((c) => matches(query, c.label)), [commands, query])

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
    <div className="fixed inset-0 z-[var(--z-modal)] flex justify-center px-4 pt-[15vh]">
      <div className="cw-scrim" onClick={close} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="cw-command animate-overlay-in relative z-[61] self-start"
      >
        <div className="cw-command__input">
          <Search strokeWidth={1.5} aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelected(0)
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Go to a page or category, or run an action"
            aria-label="Command"
          />
        </div>

        {results.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted">No matches</div>
        ) : (
          <ul className="cw-command__list max-h-80 overflow-y-auto">
            {results.map((c, i) => (
              <li key={c.id}>
                {(i === 0 || results[i - 1].group !== c.group) && (
                  <div className="cw-menu__label">{c.group}</div>
                )}
                <button
                  type="button"
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => {
                    close()
                    c.run()
                  }}
                  data-active={i === selected}
                  className="cw-menu__item"
                >
                  <c.icon strokeWidth={1.5} aria-hidden="true" />
                  {c.label}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="cw-command__foot [@media(hover:none)]:hidden!">
          <span>
            <kbd className="cw-kbd">↵</kbd>Open
          </span>
          <span>
            <kbd className="cw-kbd">↑↓</kbd>Move
          </span>
          <span>
            <kbd className="cw-kbd">esc</kbd>Close
          </span>
        </div>
      </div>
    </div>
  )
}
