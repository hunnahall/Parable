import Link from 'next/link'
import { categoryHref } from '@/components/layout/sidebarNav'
import type { CategoryRow } from '@/lib/categories/data'

// The Inbox's category tabs: All, then each category with a mono count of
// its stories on screen. They're links (?category=), shared with the
// sidebar's category items, so this is a nav with aria-current rather than
// ARIA tabs. On phone the row scrolls sideways and sticks under the top
// bar.
export default function CategoryTabs({
  categories,
  counts,
  total,
  current,
}: {
  categories: CategoryRow[]
  counts: Map<string, number>
  total: number
  current: string | null
}) {
  return (
    <nav
      aria-label="Categories"
      className="cw-tabs h-10 bg-background max-[999px]:sticky max-[999px]:top-14 max-[999px]:z-[var(--z-sticky)] max-[999px]:-mx-4 max-[999px]:px-4"
    >
      <Link href="/inbox" aria-current={current ? undefined : 'page'} className="cw-tab">
        All
        <span className="cw-count tabular-nums">{total}</span>
      </Link>
      {categories.map((category) => (
        <Link
          key={category.id}
          href={categoryHref(category.id)}
          aria-current={current === category.id ? 'page' : undefined}
          className="cw-tab"
        >
          {category.name}
          <span className="cw-count tabular-nums">{counts.get(category.id) ?? 0}</span>
        </Link>
      ))}
    </nav>
  )
}
