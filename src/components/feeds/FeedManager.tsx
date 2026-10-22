'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, X } from 'lucide-react'
import {
  addFeed,
  updateFeed,
  removeFeed,
  runIngestNow,
} from '@/lib/feeds/actions'
import { setFeedCategory } from '@/lib/categories/actions'
import type { CategoryRow } from '@/lib/categories/data'
import type { FeedRow } from '@/lib/feeds/data'
import type { IngestSummary } from '@/lib/feeds/ingest'
import type { FeedNumbers } from '@/lib/feeds/numbers'
import { formatFetchedAt } from '@/lib/formatting'
import CategoryBar, { UNCATEGORIZED } from './CategoryBar'
import BuildFeedSection from './BuildFeedSection'
import Button from '@/components/ui/Button'
import Badge, { Tag } from '@/components/ui/Badge'
import { Field, Input, Select } from '@/components/ui/Input'
import EmptyState from '@/components/ui/EmptyState'

const NO_CATEGORY = 'No category'

type SortKey = 'name' | 'perDay' | 'opened'

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'name', label: 'Name' },
  { id: 'perDay', label: 'Most articles' },
  { id: 'opened', label: 'Least opened' },
]

// Under 10 a day gets one decimal, so a quiet feed doesn't read as 0.
function formatPerDay(numbers: FeedNumbers | undefined): string {
  const perDay = numbers?.perDay ?? 0
  return perDay < 10 ? perDay.toFixed(1) : Math.round(perDay).toLocaleString()
}

// Health on the Feeds page. Failing uses the Inbox banner's rule (3 failed
// runs in a row). Quiet is under half an article a day once at least 3 days
// are counted; tune both on real feeds.
const FAILING_RUNS = 3
const QUIET_PER_DAY = 0.5
const QUIET_MIN_DAYS = 3

function FeedHealthBadge({ feed, numbers }: { feed: FeedRow; numbers: FeedNumbers | undefined }) {
  if (feed.consecutive_failures >= FAILING_RUNS) {
    return (
      <span title={feed.last_error ?? undefined}>
        <Badge tone="danger">Failing</Badge>
      </span>
    )
  }
  if (numbers && numbers.days >= QUIET_MIN_DAYS && numbers.perDay < QUIET_PER_DAY) {
    return <Badge tone="warning">Quiet</Badge>
  }
  return <Badge tone="success">Healthy</Badge>
}

function formatOpened(numbers: FeedNumbers | undefined): string {
  if (!numbers || numbers.openedRate === null) return '–'
  return `${Math.round(numbers.openedRate * 100)}%`
}

export default function FeedManager({
  feeds,
  categories,
  numbers,
}: {
  feeds: FeedRow[]
  categories: CategoryRow[]
  numbers: Record<string, FeedNumbers>
}) {
  const router = useRouter()
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [sort, setSort] = useState<SortKey>('name')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  // Optimistic local copy — router.refresh() re-runs this whole page's
  // server data, so gating a visible add/edit/remove on it made the list
  // feel multi-second slow. See ArticleList.tsx for the same reasoning.
  const [localFeeds, setLocalFeeds] = useState(feeds)
  const [syncedFrom, setSyncedFrom] = useState(feeds)
  if (feeds !== syncedFrom) {
    setSyncedFrom(feeds)
    setLocalFeeds(feeds)
  }

  const [newUrl, setNewUrl] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newCategoryId, setNewCategoryId] = useState('')

  const [editTitle, setEditTitle] = useState('')
  const [editCategoryId, setEditCategoryId] = useState('')

  const [ingesting, setIngesting] = useState(false)
  const [ingestSummary, setIngestSummary] = useState<IngestSummary | null>(null)
  const [ingestError, setIngestError] = useState<string | null>(null)

  const categoryName = (id: string | null) =>
    categories.find((c) => c.id === id)?.name ?? NO_CATEGORY

  const visibleFeeds = localFeeds
    .filter((feed) => {
      if (categoryFilter === 'all') return true
      if (categoryFilter === UNCATEGORIZED) return feed.categoryId === null
      return feed.categoryId === categoryFilter
    })
    .sort((a, b) => {
      // Feeds with nothing to open yet sort after every opened rate.
      if (sort === 'perDay') return (numbers[b.id]?.perDay ?? 0) - (numbers[a.id]?.perDay ?? 0)
      if (sort === 'opened') return (numbers[a.id]?.openedRate ?? 2) - (numbers[b.id]?.openedRate ?? 2)
      return a.title.localeCompare(b.title)
    })

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    const result = await addFeed({
      url: newUrl,
      title: newTitle,
      categoryId: newCategoryId || null,
    })
    if (result.error !== null) {
      setPending(false)
      setError(result.error)
      return
    }
    setPending(false)
    setLocalFeeds((prev) => [...prev, result.feed])
    setNewUrl('')
    setNewTitle('')
    setNewCategoryId('')
    router.refresh()
  }

  function handleFeedBuilt(feed: FeedRow) {
    setLocalFeeds((prev) => [...prev, feed])
    router.refresh()
  }

  function startEdit(feed: FeedRow) {
    setEditingId(feed.id)
    setEditTitle(feed.title)
    setEditCategoryId(feed.categoryId ?? '')
    setError(null)
  }

  async function handleSaveEdit(id: string) {
    setPending(true)
    setError(null)
    const title = editTitle.trim()
    setLocalFeeds((prev) =>
      prev.map((feed) => (feed.id === id ? { ...feed, title, categoryId: editCategoryId || null } : feed))
    )
    setEditingId(null)
    const [titleResult, categoryResult] = await Promise.all([
      updateFeed(id, { title: editTitle }),
      setFeedCategory(id, editCategoryId || null),
    ])
    setPending(false)
    if (titleResult.error) {
      setError(titleResult.error)
      return
    }
    if (categoryResult.error) {
      setError(categoryResult.error)
      return
    }
    router.refresh()
  }

  async function handleRemove(id: string) {
    setPending(true)
    setError(null)
    setLocalFeeds((prev) => prev.filter((feed) => feed.id !== id))
    const result = await removeFeed(id)
    setPending(false)
    if (result.error) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  async function handleRunIngest() {
    setIngesting(true)
    setIngestError(null)
    setIngestSummary(null)
    const result = await runIngestNow()
    setIngesting(false)
    if (result.error) {
      setIngestError(result.error)
      return
    }
    setIngestSummary(result.summary)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <section className="cw-panel">
        <div className="cw-panel__head">
          <h2 className="cw-panel__title">Add a feed</h2>
        </div>
        <form onSubmit={handleAdd} className="cw-panel__body grid gap-3 min-[640px]:grid-cols-[2fr_1.5fr_1fr_auto] min-[640px]:items-end">
          <Field label="Feed URL" htmlFor="new-feed-url">
            <Input
              id="new-feed-url"
              type="url"
              placeholder="https://example.com/rss.xml"
              required
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
            />
          </Field>
          <Field label="Title" htmlFor="new-feed-title">
            <Input
              id="new-feed-title"
              placeholder="Detected if left blank"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
          </Field>
          <Field label="Category" htmlFor="new-feed-category">
            <Select
              id="new-feed-category"
              value={newCategoryId}
              onChange={(e) => setNewCategoryId(e.target.value)}
            >
              <option value="">{NO_CATEGORY}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? 'Adding' : 'Add feed'}
          </Button>
        </form>
        {error && <p className="cw-error px-4 pb-4">{error}</p>}
      </section>

      <BuildFeedSection categories={categories} onCreated={handleFeedBuilt} />

      <section className="cw-panel">
        <div className="cw-panel__head flex-wrap">
          <h2 className="cw-panel__title">
            Your feeds{' '}
            <span className="font-mono text-xs font-normal text-muted tabular-nums">{localFeeds.length}</span>
          </h2>
          <Button size="sm" onClick={handleRunIngest} disabled={ingesting}>
            {ingesting ? 'Syncing' : 'Sync now'}
          </Button>
        </div>

        {(ingestSummary || ingestError) && (
          <div className="border-b border-border px-4 py-3 text-sm text-muted">
            {ingestSummary && (
              <>
                <p>
                  Checked {ingestSummary.feedsProcessed} feed
                  {ingestSummary.feedsProcessed === 1 ? '' : 's'} and added {ingestSummary.itemsInserted} article
                  {ingestSummary.itemsInserted === 1 ? '' : 's'}
                  {ingestSummary.itemsAutoDeleted > 0 &&
                    `, ${ingestSummary.itemsAutoDeleted} filtered out`}
                  .
                </p>
                {ingestSummary.feedsFailed.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {ingestSummary.feedsFailed.map((failure) => (
                      <li key={failure.feedId} className="text-danger">
                        {failure.url}: {failure.error}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {ingestError && <p className="text-danger">{ingestError}</p>}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <CategoryBar categories={categories} value={categoryFilter} onChange={setCategoryFilter} />
          <label className="flex items-center gap-2">
            <span className="cw-eyebrow">Sort</span>
            <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort feeds">
              {SORTS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
        </div>

        {localFeeds.length === 0 ? (
          <div className="p-4">
            <EmptyState art="feeds" title="No feeds yet">
              Add a feed&rsquo;s address above, or build one for a site with no RSS. Its stories reach the Inbox on the
              next update.
            </EmptyState>
          </div>
        ) : visibleFeeds.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">No feeds here yet.</p>
        ) : (
          // Scrolls sideways inside the panel on narrow screens.
          <div className="cw-table-wrap">
            <table className="cw-table">
              <thead>
                <tr>
                  <th scope="col">Feed</th>
                  <th scope="col">Category</th>
                  <th scope="col">Health</th>
                  <th scope="col">Last loaded</th>
                  <th scope="col" className="is-num">
                    A day
                  </th>
                  <th scope="col" className="is-num">
                    Opened
                  </th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleFeeds.map((feed) =>
                  editingId === feed.id ? (
                    <tr key={feed.id}>
                      <td colSpan={7} className="py-3 whitespace-normal">
                        <div className="grid gap-3 min-[640px]:grid-cols-[2fr_1fr_auto_auto] min-[640px]:items-end">
                          <Field label="Title" htmlFor={`edit-title-${feed.id}`}>
                            <Input
                              id={`edit-title-${feed.id}`}
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                            />
                          </Field>
                          <Field label="Category" htmlFor={`edit-category-${feed.id}`}>
                            <Select
                              id={`edit-category-${feed.id}`}
                              value={editCategoryId}
                              onChange={(e) => setEditCategoryId(e.target.value)}
                            >
                              <option value="">{NO_CATEGORY}</option>
                              {categories.map((category) => (
                                <option key={category.id} value={category.id}>
                                  {category.name}
                                </option>
                              ))}
                            </Select>
                          </Field>
                          <Button variant="primary" disabled={pending} onClick={() => handleSaveEdit(feed.id)}>
                            Save feed
                          </Button>
                          <Button variant="ghost" onClick={() => setEditingId(null)}>
                            Cancel
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={feed.id}>
                      <td>
                        {/* Long feed names truncate; the full name and URL are in the link's title. */}
                        <span className="flex max-w-[14rem] items-center gap-2">
                          <a
                            href={feed.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`${feed.title}\n${feed.url}`}
                            className="min-w-0 truncate font-medium underline-offset-4 hover:underline"
                          >
                            {feed.title}
                          </a>
                          {feed.is_scraped && <Tag>BUILT</Tag>}
                        </span>
                      </td>
                      <td className="is-muted">{categoryName(feed.categoryId)}</td>
                      <td>
                        <FeedHealthBadge feed={feed} numbers={numbers[feed.id]} />
                      </td>
                      <td className="is-muted">{formatFetchedAt(feed.last_fetched_at)}</td>
                      <td className="is-num">{formatPerDay(numbers[feed.id])}</td>
                      <td className="is-num">{formatOpened(numbers[feed.id])}</td>
                      <td>
                        {/* Native titles rather than Tooltip: a tooltip at the table's right edge
                            would widen the scroll area. */}
                        <span className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            icon
                            aria-label="Edit feed"
                            title="Edit feed"
                            onClick={() => startEdit(feed)}
                          >
                            <Pencil strokeWidth={1.5} aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon
                            aria-label="Remove feed"
                            title="Remove feed"
                            disabled={pending}
                            onClick={() => handleRemove(feed.id)}
                            className="hover:text-danger!"
                          >
                            <X strokeWidth={1.5} aria-hidden="true" />
                          </Button>
                        </span>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
