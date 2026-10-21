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
import CategoryManager from './CategoryManager'
import FolderManager from './FolderManager'
import type { FolderRow } from '@/lib/folders/data'
import BuildFeedSection from './BuildFeedSection'
import Button from '@/components/ui/Button'
import Badge, { Tag } from '@/components/ui/Badge'
import { Field, Input, Select } from '@/components/ui/Input'
import Tooltip from '@/components/ui/Tooltip'

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

function formatOpened(numbers: FeedNumbers | undefined): string {
  if (!numbers || numbers.openedRate === null) return '–'
  return `${Math.round(numbers.openedRate * 100)}%`
}

export default function FeedManager({
  feeds,
  categories,
  folderRows,
  numbers,
}: {
  feeds: FeedRow[]
  categories: CategoryRow[]
  folderRows: FolderRow[]
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
      if (categoryFilter === 'uncategorized') return feed.categoryId === null
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

      <CategoryManager categories={categories} />

      <FolderManager folders={folderRows} />

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
          <div className="min-w-0 max-w-full overflow-x-auto">
          <div className="cw-seg" role="group" aria-label="Show feeds in">
            {[
              { id: 'all', label: 'All' },
              ...categories.map((c) => ({ id: c.id, label: c.name })),
              { id: 'uncategorized', label: NO_CATEGORY },
            ].map(
              (option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={categoryFilter === option.id}
                  onClick={() => setCategoryFilter(option.id)}
                >
                  {option.label}
                </button>
              )
            )}
          </div>
          </div>
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

        {visibleFeeds.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">No feeds here yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {visibleFeeds.map((feed) => (
              <li key={feed.id} className="group px-4 py-3 transition-colors hover:bg-fill-hover">
                {editingId === feed.id ? (
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
                ) : (
                  <div className="flex items-start gap-4">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-medium">{feed.title}</span>
                        {feed.is_scraped && <Tag>BUILT</Tag>}
                        <Tag>{categoryName(feed.categoryId)}</Tag>
                        {feed.consecutive_failures >= 3 && (
                          <Badge tone="danger">Failing {feed.consecutive_failures} runs</Badge>
                        )}
                      </div>
                      <a
                        href={feed.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-xs text-muted hover:underline"
                      >
                        {feed.url}
                      </a>
                      <p className="text-xs text-muted">
                        Last loaded {formatFetchedAt(feed.last_fetched_at)}
                        <span className="tabular-nums min-[640px]:hidden">
                          {' '}
                          · {formatPerDay(numbers[feed.id])} a day
                          {numbers[feed.id]?.openedRate != null && ` · ${formatOpened(numbers[feed.id])} opened`}
                        </span>
                      </p>
                      {feed.last_error && <p className="text-xs text-danger">{feed.last_error}</p>}
                    </div>
                    <dl className="hidden shrink-0 grid-cols-2 gap-6 text-right min-[640px]:grid">
                      <div className="space-y-1">
                        <dt className="cw-eyebrow">A day</dt>
                        <dd className="text-base tabular-nums">{formatPerDay(numbers[feed.id])}</dd>
                      </div>
                      <div className="space-y-1">
                        <dt className="cw-eyebrow">Opened</dt>
                        <dd className="text-base tabular-nums">{formatOpened(numbers[feed.id])}</dd>
                      </div>
                    </dl>
                    <div className="flex shrink-0 items-center gap-1">
                      <Tooltip label="Edit feed">
                        <Button variant="ghost" size="sm" icon aria-label="Edit feed" onClick={() => startEdit(feed)}>
                          <Pencil strokeWidth={1.5} aria-hidden="true" />
                        </Button>
                      </Tooltip>
                      <Tooltip label="Remove feed">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon
                          aria-label="Remove feed"
                          disabled={pending}
                          onClick={() => handleRemove(feed.id)}
                          className="hover:text-danger"
                        >
                          <X strokeWidth={1.5} aria-hidden="true" />
                        </Button>
                      </Tooltip>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
