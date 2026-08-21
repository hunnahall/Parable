'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/articles', label: 'Articles' },
  { href: '/feeds', label: 'Feeds' },
  { href: '/indicators', label: 'Indicators' },
  { href: '/settings', label: 'Settings' },
]

export default function NavLinks() {
  const pathname = usePathname()

  return (
    <nav className="flex items-center gap-5 text-sm font-label uppercase tracking-wide">
      {LINKS.map((link) => {
        // Exact match for "/" (every route starts with it); prefix match
        // otherwise, so a nested route under e.g. /articles/[id] would
        // still show Articles as active.
        const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href)
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={
              active
                ? 'text-foreground border-b-2 border-accent pb-0.5 transition-colors'
                : 'text-muted hover:text-accent border-b-2 border-transparent pb-0.5 transition-colors'
            }
          >
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
