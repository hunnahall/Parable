import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { listFeedsDetailed } from '@/lib/feeds/data'
import { getFeedNumbers } from '@/lib/feeds/numbers'
import { listCategories } from '@/lib/categories/data'
import { listFolders } from '@/lib/folders/data'
import PageHeader from '@/components/layout/PageHeader'
import FeedManager from '@/components/feeds/FeedManager'

// The feed budget from context.md. Shown, not enforced.
const FEED_BUDGET = 50

// How close the feed list is to the budget: a 4px bar in the accent, warning
// from 90%, danger past 100% (the spec's budget rule).
function FeedBudget({ count }: { count: number }) {
  const share = count / FEED_BUDGET
  const tone = share > 1 ? 'cw-progress--danger' : share >= 0.9 ? 'cw-progress--warning' : ''
  return (
    <section aria-label="Feed budget" className="cw-panel space-y-2 px-4 py-3">
      <p className="flex items-baseline justify-between gap-3 text-sm">
        <span>
          <span className="tabular-nums">{count}</span> of {FEED_BUDGET} feeds
        </span>
        {share > 1 && <span className="text-xs text-muted">{count - FEED_BUDGET} over budget</span>}
      </p>
      <div
        className={`cw-progress ${tone}`}
        role="progressbar"
        aria-label="Feeds used of the budget"
        aria-valuemin={0}
        aria-valuemax={FEED_BUDGET}
        aria-valuenow={count}
      >
        <span style={{ width: `${Math.min(100, share * 100)}%` }} />
      </div>
    </section>
  )
}

export default async function FeedsPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const [feeds, categories, folderRows, numbers] = await Promise.all([
    listFeedsDetailed(),
    listCategories(),
    listFolders(),
    getFeedNumbers(),
  ])

  return (
    <>
      <PageHeader title="Feeds" wide figure={{ value: `${feeds.length} / ${FEED_BUDGET}`, label: 'Feeds' }} />
      {/* Wide: the feed table has seven columns. */}
      <div className="mx-auto max-w-[var(--content-max)] space-y-6 px-4 py-6 min-[1000px]:px-8">
        <FeedBudget count={feeds.length} />
        <FeedManager
          feeds={feeds}
          categories={categories}
          folderRows={folderRows}
          numbers={Object.fromEntries(numbers)}
        />
      </div>
    </>
  )
}
