'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SIDEBAR_NAV, isNavEntryActive } from './sidebarNav'
import SidebarDivider from './SidebarDivider'
import CountBadge from './CountBadge'

export default function SidebarNavList({
  collapsed = false,
  inboxCount,
  onNavigate,
}: {
  collapsed?: boolean
  inboxCount: number
  onNavigate?: () => void
}) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-0.5">
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
            title={collapsed ? entry.label : undefined}
            className={
              'flex items-center gap-2.5 h-8 px-2 rounded-md text-base font-medium font-label transition-colors ' +
              (collapsed ? 'justify-center ' : '') +
              (active
                ? 'bg-foreground/[0.08] text-foreground'
                : 'text-muted hover:bg-foreground/[0.04] hover:text-foreground')
            }
          >
            <Icon size={15} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
            {!collapsed && <span className="flex-1 truncate">{entry.label}</span>}
            {!collapsed && badgeCount > 0 && <CountBadge count={badgeCount} />}
          </Link>
        )
      })}
    </nav>
  )
}
