import {
  Newspaper,
  BookOpen,
  Bookmark,
  Archive,
  Rss,
  Filter,
  Settings,
  type LucideIcon,
} from 'lucide-react'

export type SidebarNavEntry =
  | { type: 'link'; href: string; label: string; icon: LucideIcon; badge?: 'inbox' | 'reader' }
  | { type: 'divider' }

export const SIDEBAR_NAV: SidebarNavEntry[] = [
  { type: 'link', href: '/inbox', label: 'Inbox', icon: Newspaper, badge: 'inbox' },
  { type: 'link', href: '/reader', label: 'Reader', icon: BookOpen, badge: 'reader' },
  { type: 'link', href: '/saved', label: 'Saved', icon: Bookmark },
  { type: 'link', href: '/archive', label: 'Archive', icon: Archive },
  { type: 'link', href: '/feeds', label: 'Feeds', icon: Rss },
  { type: 'divider' },
  { type: 'link', href: '/filters', label: 'Filters', icon: Filter },
  { type: 'link', href: '/settings', label: 'Settings', icon: Settings },
]

// Exact match for "/" (every route starts with it); prefix match otherwise.
export function isNavEntryActive(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}
