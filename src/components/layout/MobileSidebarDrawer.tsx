'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import ParableMark from '@/components/brand/ParableMark'
import NavColumn from './NavColumn'
import { NAV_LINKS, isNavEntryActive, type ShellData } from './sidebarNav'

// Under 1000px the sidebar collapses to a top bar (logo, page title, menu
// button); the menu opens the same navigation as a Level 2 sheet from the
// left.
export default function MobileSidebarDrawer({ shell }: { shell: ShellData }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // A category's Inbox view is titled with the category's name.
  const category =
    pathname === '/inbox' ? shell.categories.find((c) => c.id === searchParams.get('category')) : undefined
  const title = category?.name ?? NAV_LINKS.find((entry) => isNavEntryActive(entry.href, pathname))?.label ?? 'Parable'

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <>
      <header className="sticky top-0 z-[var(--z-sticky)] flex h-14 items-center gap-3 border-b border-border bg-background px-4 min-[1000px]:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          aria-expanded={open}
          className="cw-btn cw-btn--ghost cw-btn--icon -ml-2"
        >
          <Menu strokeWidth={1.5} aria-hidden="true" />
        </button>
        <Link href="/inbox" aria-label="Parable, Inbox">
          <ParableMark size={22} tone="accent" />
        </Link>
        <span className="truncate text-base font-semibold">{title}</span>
      </header>

      {open && (
        <div className="fixed inset-0 z-[var(--z-modal)] min-[1000px]:hidden">
          <div className="cw-scrim" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="card-modal absolute inset-y-0 left-0 z-[61] w-[min(var(--sidebar-w),85vw)] border-y-0 border-l-0"
          >
            <NavColumn
              shell={shell}
              onNavigate={() => setOpen(false)}
              headerAction={
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close navigation"
                  className="cw-btn cw-btn--ghost cw-btn--icon -mr-2"
                >
                  <X strokeWidth={1.5} aria-hidden="true" />
                </button>
              }
            />
          </div>
        </div>
      )}
    </>
  )
}
