'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SIDEBAR_NAV, isNavEntryActive } from './sidebarNav'
import SidebarDivider from './SidebarDivider'
import CountBadge from './CountBadge'

export default function SidebarNavList({
  collapsed = false,
  articlesUnfiledCount,
  onNavigate,
}: {
  collapsed?: boolean
  articlesUnfiledCount: number
  onNavigate?: () => void
}) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-0.5">
      {SIDEBAR_NAV.map((entry, i) => {
        if (entry.type === 'divider') return <SidebarDivider key={`divider-${i}`} />

        const active = isNavEntryActive(entry.href, pathname)
        const Icon = entry.icon
        const badgeCount = entry.badge === 'articles' ? articlesUnfiledCount : 0

        return (
          <Link
            key={entry.href}
            href={entry.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            title={collapsed ? entry.label : undefined}
            className={
              'flex items-center gap-3 px-3 py-2 text-lg font-bold font-label transition-colors ' +
              (active
                ? 'text-foreground border-l-2 border-accent bg-foreground/5'
                : 'text-muted hover:text-foreground border-l-2 border-transparent')
            }
          >
            <Icon size={16} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
            {!collapsed && <span className="flex-1 truncate">{entry.label}</span>}
            {!collapsed && badgeCount > 0 && <CountBadge count={badgeCount} />}
          </Link>
        )
      })}
    </nav>
  )
}
