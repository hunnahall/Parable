import Link from 'next/link'
import Alert from '@/components/ui/Alert'
import { FEED_FAILING_RUNS, type Health } from '@/lib/health/data'

// Inbox banners for the two failures an empty Inbox would otherwise hide:
// Parable itself not loading anything, and a feed that stopped loading.
export default function HealthBanners({ health }: { health: Health }) {
  const { ingestStale, failingFeeds } = health
  if (!ingestStale && failingFeeds.length === 0) return null

  return (
    <div className="space-y-2">
      {ingestStale && (
        <Alert tone="danger" title="Parable isn't loading new articles">
          {ingestStale.hoursSince === null
            ? 'No successful run is recorded.'
            : `The last successful run was ${ingestStale.hoursSince} hours ago.`}{' '}
          Runs are every 2 hours, so the schedule or the server has stopped. What you see here may be
          out of date.
        </Alert>
      )}
      {failingFeeds.length > 0 && (
        <Alert
          tone="warning"
          title={
            failingFeeds.length === 1
              ? `${failingFeeds[0].title} has stopped loading`
              : `${failingFeeds.length} feeds have stopped loading`
          }
        >
          {failingFeeds.length === 1
            ? `It failed its last ${failingFeeds[0].failures} runs. `
            : `${failingFeeds.map((f) => f.title).join(', ')}. Each failed at least its last ${FEED_FAILING_RUNS} runs. `}
          <Link href="/feeds" className="underline underline-offset-4">
            Check them on Feeds
          </Link>
          .
        </Alert>
      )}
    </div>
  )
}
