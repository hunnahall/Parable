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
  | {
      type: 'link'
      href: string
      label: string
      icon: LucideIcon
      badge?: 'inbox'
      // false keeps a destination in the command palette but out of the
      // sidebar list (Settings lives in the avatar menu).
      inSidebar?: boolean
    }
  | { type: 'label'; label: string }
  // Where the user's categories go, each linking to its Inbox section.
  | { type: 'categories' }
  | { type: 'divider' }

// The Inbox, then its categories, then the library of kept stories, then
// the things that configure them.
export const SIDEBAR_NAV: SidebarNavEntry[] = [
  { type: 'link', href: '/inbox', label: 'Inbox', icon: Newspaper, badge: 'inbox' },
  { type: 'categories' },
  { type: 'label', label: 'Library' },
  { type: 'link', href: '/archive', label: 'Archive', icon: Archive },
  { type: 'link', href: '/saved', label: 'Saved', icon: Bookmark },
  { type: 'divider' },
  { type: 'link', href: '/feeds', label: 'Feeds', icon: Rss },
  { type: 'link', href: '/filters', label: 'Filters', icon: Filter },
  { type: 'link', href: '/settings', label: 'Settings', icon: Settings, inSidebar: false },
]

// The destinations, for the command palette and the top bar's title.
export const NAV_LINKS = SIDEBAR_NAV.flatMap((entry) => (entry.type === 'link' ? [entry] : []))

// Exact match for "/" (every route starts with it); prefix match otherwise.
export function isNavEntryActive(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

// A category's Inbox view.
export function categoryHref(categoryId: string): string {
  return `/inbox?category=${encodeURIComponent(categoryId)}`
}

// What the sidebar needs about each category.
export interface SidebarCategory {
  id: string
  name: string
  count: number
}

// Everything the shell (sidebar, phone sheet, command palette) reads,
// fetched once in the root layout.
export interface ShellData {
  userEmail: string
  inboxCount: number
  categories: SidebarCategory[]
  theme: 'system' | 'dark' | 'light'
  // Last successful ingest, and the hours after which it counts as down.
  lastSuccessAt: string | null
  staleHours: number
}
