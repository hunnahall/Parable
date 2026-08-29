'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import ParableLogo from '@/components/brand/ParableLogo'
import SidebarNavList from './SidebarNavList'
import { signOut } from '@/app/login/actions'

export default function MobileSidebarDrawer({
  userEmail,
  articlesUnfiledCount,
}: {
  userEmail: string
  articlesUnfiledCount: number
}) {
  const [open, setOpen] = useState(false)

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
      <header className="md:hidden flex items-center gap-4 p-4 border-b border-border">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="text-muted hover:text-foreground transition-colors shrink-0"
        >
          <Menu size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <Link href="/" aria-label="Parable">
          <ParableLogo height={24} />
        </Link>
      </header>

      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-foreground/40 transition-opacity duration-[var(--motion-standard)]"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            className="absolute inset-y-0 left-0 w-64 bg-surface border-r border-border flex flex-col shadow-[var(--shadow-modal)] transition-transform duration-[var(--motion-standard)] ease-out"
          >
            <div className="flex items-center justify-between gap-2 p-4">
              <ParableLogo height={44} />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="text-muted hover:text-foreground transition-colors"
              >
                <X size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-2">
              <SidebarNavList
                articlesUnfiledCount={articlesUnfiledCount}
                onNavigate={() => setOpen(false)}
              />
            </div>
            <div className="border-t border-border-subtle p-3 text-base">
              <div className="text-xs font-medium uppercase tracking-wider text-muted truncate mb-2">
                {userEmail}
              </div>
              <form action={signOut}>
                <button
                  type="submit"
                  className="underline text-muted hover:text-foreground transition-colors"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
