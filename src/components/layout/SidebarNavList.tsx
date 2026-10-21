'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { SIDEBAR_NAV, isNavEntryActive, categoryHref, type SidebarCategory } from './sidebarNav'
import SidebarDivider from './SidebarDivider'
import CountBadge from './CountBadge'

// components.css .cw-nav-item: 30px rows, 16px line icon in --fg-3, 13px
// label. The current page gets --fill-active, a 2px signature-color marker
// on the left edge and its icon in the signature color. Category rows have
// no icon; an empty 16px slot keeps their names in line with the others.
export default function SidebarNavList({
  inboxCount,
  categories,
  onNavigate,
}: {
  inboxCount: number
  categories: SidebarCategory[]
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentCategory = pathname === '/inbox' ? searchParams.get('category') : null

  return (
    <nav className="cw-nav" aria-label="Parable">
      {SIDEBAR_NAV.map((entry, i) => {
        if (entry.type === 'divider') return <SidebarDivider key={`divider-${i}`} />
        if (entry.type === 'label') {
          return (
            <div key={`label-${entry.label}`} className="cw-nav-label">
              {entry.label}
            </div>
          )
        }
        if (entry.type === 'categories') {
          if (categories.length === 0) return null
          return (
            <div key="categories" className="contents">
              <div className="cw-nav-label">Categories</div>
              {categories.map((category) => (
                <Link
                  key={category.id}
                  href={categoryHref(category.id)}
                  onClick={onNavigate}
                  aria-current={currentCategory === category.id ? 'page' : undefined}
                  className="cw-nav-item"
                >
                  <span className="size-4 shrink-0" aria-hidden="true" />
                  <span className="flex-1 truncate">{category.name}</span>
                  <CountBadge count={category.count} />
                </Link>
              ))}
            </div>
          )
        }
        if (entry.inSidebar === false) return null

        // The Inbox is current only on its All view, not a category's.
        const active = isNavEntryActive(entry.href, pathname) && !(entry.href === '/inbox' && currentCategory)
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
