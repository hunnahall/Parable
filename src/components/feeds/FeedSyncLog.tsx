'use client'

import type { FeedRow } from '@/lib/feeds/data'
import { usePreferences } from '@/components/preferences/PreferencesProvider'
import { formatDateTime } from '@/lib/formatting'

// Most-recently-synced feed first, with feeds that have never synced
// (last_fetched_at null — just added, not yet picked up by the ingest
// cron) pushed to the bottom rather than sorting as "oldest".
function byLastFetchedDesc(a: FeedRow, b: FeedRow): number {
  if (!a.last_fetched_at && !b.last_fetched_at) return a.title.localeCompare(b.title)
  if (!a.last_fetched_at) return 1
  if (!b.last_fetched_at) return -1
  return b.last_fetched_at.localeCompare(a.last_fetched_at)
}

export default function FeedSyncLog({ feeds }: { feeds: FeedRow[] }) {
  const { timezone, clockFormat } = usePreferences()
  const formatDate = (dateString: string | null) =>
    formatDateTime(dateString, { timezone, clockFormat }) ?? 'never'

  const sorted = [...feeds].sort(byLastFetchedDesc)

  if (sorted.length === 0) {
    return <p className="text-lg text-muted">No feeds yet.</p>
  }

  return (
    <ul className="card-elevated divide-y divide-border">
      {sorted.map((feed) => (
        <li key={feed.id} className="p-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-medium text-lg truncate">{feed.title}</p>
            <p className="text-base text-muted mt-0.5">Last synced: {formatDate(feed.last_fetched_at)}</p>
          </div>
          {feed.last_error && (
            <span
              className={
                feed.consecutive_failures >= 3
                  ? 'shrink-0 border border-danger text-danger px-2 py-0.5 text-base font-medium'
                  : 'shrink-0 text-base text-danger'
              }
              title={feed.last_error}
            >
              {feed.consecutive_failures >= 3 ? `Failing ${feed.consecutive_failures}x` : 'Last sync failed'}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}
