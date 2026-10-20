'use client'

import Link from 'next/link'
import { LogOut, Search } from 'lucide-react'
import ParableLogo from '@/components/brand/ParableLogo'
import CovenantWorksCredit from '@/components/brand/CovenantWorksCredit'
import SidebarNavList from './SidebarNavList'
import { PALETTE_OPEN_EVENT } from './CommandPalette'
import { signOut } from '@/app/login/actions'

// The sidebar's contents, shared by the fixed desktop sidebar and the
// phone/tablet sheet so the two can't drift: the app logo (the one place
// it takes the signature color), search, navigation, account, and the
// suite footer.
export default function NavColumn({
  userEmail,
  inboxCount,
  onNavigate,
  headerAction,
}: {
  userEmail: string
  inboxCount: number
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
        <SidebarNavList inboxCount={inboxCount} onNavigate={onNavigate} />
      </div>

      <div className="border-t border-border px-2 py-2">
        <div className="truncate px-2.5 pb-1 text-xs text-muted" title={userEmail}>
          {userEmail}
        </div>
        <form action={signOut}>
          <button type="submit" className="cw-nav-item w-full text-left">
            <LogOut strokeWidth={1.5} aria-hidden="true" />
            Sign out
          </button>
        </form>
      </div>

      <CovenantWorksCredit className="border-t border-border px-4 py-3" />
    </div>
  )
}
