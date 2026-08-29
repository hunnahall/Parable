import {
  LayoutGrid,
  Newspaper,
  Bookmark,
  Archive,
  Rss,
  Settings,
  type LucideIcon,
} from 'lucide-react'

export type SidebarNavEntry =
  | { type: 'link'; href: string; label: string; icon: LucideIcon; badge?: 'articles' }
  | { type: 'divider' }

export const SIDEBAR_NAV: SidebarNavEntry[] = [
  { type: 'link', href: '/', label: 'Dashboard', icon: LayoutGrid },
  { type: 'divider' },
  { type: 'link', href: '/articles', label: 'Articles', icon: Newspaper, badge: 'articles' },
  { type: 'link', href: '/saved', label: 'Saved', icon: Bookmark },
  { type: 'link', href: '/archive', label: 'Archive', icon: Archive },
  { type: 'link', href: '/feeds', label: 'Feeds', icon: Rss },
  { type: 'divider' },
  { type: 'link', href: '/settings', label: 'Settings', icon: Settings },
]

// Exact match for "/" (every route starts with it); prefix match otherwise.
export function isNavEntryActive(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}
