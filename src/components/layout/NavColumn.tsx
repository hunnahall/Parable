'use client'

import Link from 'next/link'
import { Search } from 'lucide-react'
import ParableLogo from '@/components/brand/ParableLogo'
import CovenantWorksCredit from '@/components/brand/CovenantWorksCredit'
import SidebarNavList from './SidebarNavList'
import AccountMenu from './AccountMenu'
import StatusLine from './StatusLine'
import { PALETTE_OPEN_EVENT } from './CommandPalette'
import type { ShellData } from './sidebarNav'

// The sidebar's contents, shared by the fixed desktop sidebar and the
// phone/tablet sheet so the two can't drift: the app logo (the one place
// it takes the signature color), search, navigation, the ingest status
// line, the account menu, and the suite footer.
export default function NavColumn({
  shell,
  onNavigate,
  headerAction,
}: {
  shell: ShellData
  onNavigate?: () => void
  headerAction?: React.ReactNode
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 px-4">
        <Link href="/inbox" aria-label="Parable, Inbox" onClick={onNavigate}>
          <ParableLogo height={22} tone="accent" drawIn />
        </Link>
        {headerAction}
      </div>

      <div className="px-2 pb-2">
        <button
          type="button"
          onClick={() => {
            onNavigate?.()
            window.dispatchEvent(new Event(PALETTE_OPEN_EVENT))
          }}
          className="cw-nav-item w-full border border-border text-left"
        >
          <Search strokeWidth={1.5} aria-hidden="true" />
          <span className="flex-1">Search</span>
          <kbd className="cw-kbd [@media(hover:none)]:hidden">⌘K</kbd>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        <SidebarNavList inboxCount={shell.inboxCount} categories={shell.categories} onNavigate={onNavigate} />
      </div>

      <div className="border-t border-border px-2 py-2">
        <StatusLine lastSuccessAt={shell.lastSuccessAt} staleHours={shell.staleHours} />
        <AccountMenu userEmail={shell.userEmail} theme={shell.theme} onNavigate={onNavigate} />
      </div>

      <CovenantWorksCredit className="border-t border-border px-4 py-3" />
    </div>
  )
}
