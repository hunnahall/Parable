'use client'

import { useState } from 'react'
import type { Story } from '@/lib/stories/data'
import type { CategoryRow } from '@/lib/categories/data'
import type { FilteredTitle } from '@/lib/filters/data'

// The chart palette has twelve colors (tokens.css --chart-1..12, Parable's
// signature first). Past that, categories are grouped as Other.
const CHART_COLORS = 12
const MUTED = 'var(--fg-3)'

interface Segment {
  key: string
  name: string
  count: number
  color: string
}

// Today's stories by category, each story counted once by its lead (newest)
// source's category. Colors follow the category's place in the user's order,
// never its rank, so a category keeps its color as counts change.
function segmentsFor(stories: Story[], categories: CategoryRow[]): Segment[] {
  const counts = new Map<string, number>()
  for (const story of stories) {
    const key = story.sources[0]?.categoryId ?? 'none'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const segments: Segment[] = []
  let other = 0
  categories.forEach((category, i) => {
    const count = counts.get(category.id) ?? 0
    counts.delete(category.id)
    if (count === 0) return
    if (i < CHART_COLORS) segments.push({ key: category.id, name: category.name, count, color: `var(--chart-${i + 1})` })
    else other += count
  })
  if (other > 0) segments.push({ key: 'other', name: 'Other', count: other, color: MUTED })
  // Uncategorized feeds, or a category that no longer exists.
  const none = [...counts.values()].reduce((sum, n) => sum + n, 0)
  if (none > 0) segments.push({ key: 'none', name: 'No category', count: none, color: MUTED })
  return segments
}

// Under the Inbox head row: stats sharing hairlines (Stories, New, Filtered
// today, Feeds with stories; only the first two under 640px), a seen
// progress bar, and on the All view a stacked bar of stories by category
// with its legend.
export default function InboxOverview({
  stories,
  seenCount,
  filteredTitles,
  categories,
  showChart,
}: {
  stories: Story[]
  seenCount: number
  filteredTitles: FilteredTitle[]
  categories: CategoryRow[]
  showChart: boolean
}) {
  // Today is the reader's local day, as in FilteredToday.
  const [midnight] = useState(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  })
  const filteredToday = filteredTitles.filter((t) => new Date(t.filteredAt).getTime() >= midnight).length
  const feedCount = new Set(stories.flatMap((story) => story.sources.map((s) => s.feedId))).size
  const total = stories.length
  const seenShare = total === 0 ? 0 : Math.round((seenCount / total) * 100)
  const segments = showChart ? segmentsFor(stories, categories) : []

  const stats: { label: string; value: number; phone: boolean }[] = [
    { label: 'Stories', value: total, phone: true },
    { label: 'New', value: total - seenCount, phone: true },
    { label: 'Filtered today', value: filteredToday, phone: false },
    { label: 'Feeds with stories', value: feedCount, phone: false },
  ]

  return (
    <section aria-label="Inbox overview" className="cw-panel">
      <dl className="grid grid-cols-1 gap-px border-b border-border bg-border min-[640px]:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className={`cw-stat bg-surface px-4 py-3 ${stat.phone ? '' : 'max-[639px]:hidden!'}`}>
            <dt className="cw-eyebrow">{stat.label}</dt>
            <dd className="cw-stat__value" suppressHydrationWarning>
              {stat.value.toLocaleString('en-US')}
            </dd>
          </div>
        ))}
      </dl>

      <div className="space-y-4 px-4 py-3">
        <div className="space-y-2">
          <div
            className="cw-progress"
            role="progressbar"
            aria-label="Stories seen"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={seenCount}
          >
            <span style={{ width: `${seenShare}%` }} />
          </div>
          <p className="cw-eyebrow tabular-nums">
            {seenCount} of {total} seen
          </p>
        </div>

        {segments.length > 1 && (
          <div className="space-y-2">
            <div
              role="img"
              aria-label={`Stories by category: ${segments.map((s) => `${s.name} ${s.count}`).join(', ')}`}
              className="flex h-3 gap-px"
            >
              {segments.map((segment) => (
                <span
                  key={segment.key}
                  title={`${segment.name}: ${segment.count}`}
                  style={{ flexGrow: segment.count, background: segment.color }}
                  className="min-w-0.5"
                />
              ))}
            </div>
            <div className="cw-legend" aria-hidden="true">
              {segments.map((segment) => (
                <span key={segment.key}>
                  <i style={{ background: segment.color }} />
                  {segment.name}
                  <span className="font-mono tabular-nums text-foreground">{segment.count}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
