import {
  Newspaper,
  Bookmark,
  Archive,
  Rss,
  Filter,
  Settings,
  type LucideIcon,
} from 'lucide-react'

export type SidebarNavEntry =
  | { type: 'link'; href: string; label: string; icon: LucideIcon; badge?: 'inbox' }
  | { type: 'divider' }

// Above the rule: the article surfaces, in triage order. Below it: the
// things that configure them.
export const SIDEBAR_NAV: SidebarNavEntry[] = [
  { type: 'link', href: '/inbox', label: 'Inbox', icon: Newspaper, badge: 'inbox' },
  { type: 'link', href: '/save', label: 'Save', icon: Bookmark },
  { type: 'link', href: '/archive', label: 'Archive', icon: Archive },
  { type: 'divider' },
  { type: 'link', href: '/feeds', label: 'Feeds', icon: Rss },
  { type: 'link', href: '/filters', label: 'Filters', icon: Filter },
  { type: 'link', href: '/settings', label: 'Settings', icon: Settings },
]

// Exact match for "/" (every route starts with it); prefix match otherwise.
export function isNavEntryActive(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}
