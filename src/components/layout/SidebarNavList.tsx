'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SIDEBAR_NAV, isNavEntryActive } from './sidebarNav'
import SidebarDivider from './SidebarDivider'
import CountBadge from './CountBadge'

// components.css .cw-nav-item: 30px rows, 16px line icon in --fg-3, 13px
// label. The current page gets --fill-active, a 2px signature-color marker
// on the left edge and its icon in the signature color.
export default function SidebarNavList({
  inboxCount,
  onNavigate,
}: {
  inboxCount: number
  onNavigate?: () => void
}) {
  const pathname = usePathname()

  return (
    <nav className="cw-nav" aria-label="Parable">
      {SIDEBAR_NAV.map((entry, i) => {
        if (entry.type === 'divider') return <SidebarDivider key={`divider-${i}`} />

        const active = isNavEntryActive(entry.href, pathname)
        const Icon = entry.icon
        const badgeCount = entry.badge === 'inbox' ? inboxCount : 0

        return (
          <Link
            key={entry.href}
            href={entry.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className="cw-nav-item"
          >
            <Icon strokeWidth={1.5} aria-hidden="true" />
            <span className="flex-1 truncate">{entry.label}</span>
            <CountBadge count={badgeCount} />
          </Link>
        )
      })}
    </nav>
  )
}
