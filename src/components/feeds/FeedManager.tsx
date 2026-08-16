'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { addFeed, updateFeed, removeFeed, runIngestNow } from '@/lib/feeds/actions'
import type { FeedRow } from '@/lib/feeds/data'
import type { IngestSummary } from '@/lib/feeds/ingest'
import CategoryManager from './CategoryManager'

const UNCATEGORIZED = 'Uncategorized'

function formatDate(dateString: string | null): string {
  if (!dateString) return 'never'
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return 'never'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function FeedManager({
  feeds,
  categories,
}: {
  feeds: FeedRow[]
  categories: string[]
}) {
  const router = useRouter()
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const [newUrl, setNewUrl] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newCategory, setNewCategory] = useState('')

  const [editTitle, setEditTitle] = useState('')
  const [editCategory, setEditCategory] = useState('')

  const [ingesting, setIngesting] = useState(false)
  const [ingestSummary, setIngestSummary] = useState<IngestSummary | null>(null)
  const [ingestError, setIngestError] = useState<string | null>(null)

  const filterOptions = useMemo(() => {
    const set = new Set(feeds.map((feed) => feed.category || UNCATEGORIZED))
    return ['all', ...Array.from(set).sort()]
  }, [feeds])

  const visibleFeeds = feeds.filter((feed) => {
    if (categoryFilter === 'all') return true
    return (feed.category || UNCATEGORIZED) === categoryFilter
  })

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    const result = await addFeed({ url: newUrl, title: newTitle, category: newCategory || null })
    setPending(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setNewUrl('')
    setNewTitle('')
    setNewCategory('')
    router.refresh()
  }

  function startEdit(feed: FeedRow) {
    setEditingId(feed.id)
    setEditTitle(feed.title)
    setEditCategory(feed.category ?? '')
    setError(null)
  }

  async function handleSaveEdit(id: string) {
    setPending(true)
    setError(null)
    const result = await updateFeed(id, { title: editTitle, category: editCategory || null })
    setPending(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setEditingId(null)
    router.refresh()
  }

  async function handleRemove(id: string) {
    setPending(true)
    setError(null)
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
      <div className="flex items-center justify-between border border-border rounded-lg p-4">
        <div>
          <h2 className="text-sm font-medium">Run ingest now</h2>
          <p className="text-xs text-muted mt-0.5">
            Fetches new items for every feed instead of waiting for the cron job.
          </p>
          {ingestSummary && (
            <div className="text-xs text-muted mt-1">
              <p>
                Processed {ingestSummary.feedsProcessed} feed
                {ingestSummary.feedsProcessed === 1 ? '' : 's'}, added{' '}
                {ingestSummary.itemsInserted} new item
                {ingestSummary.itemsInserted === 1 ? '' : 's'}.
              </p>
              {ingestSummary.feedsFailed.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {ingestSummary.feedsFailed.map((failure) => (
                    <li key={failure.feedId} className="text-red-600">
                      {failure.url}: {failure.error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {ingestError && <p className="text-xs text-red-600 mt-1">{ingestError}</p>}
        </div>
        <button
          type="button"
          onClick={handleRunIngest}
          disabled={ingesting}
          className="rounded-full border border-border px-4 py-2 text-sm hover:bg-foreground/5 disabled:opacity-50 shrink-0"
        >
          {ingesting ? 'Running…' : 'Run ingest now'}
        </button>
      </div>

      <form onSubmit={handleAdd} className="border border-border rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-medium">Add a feed</h2>
        <div className="flex flex-wrap gap-3">
          <input
            type="url"
            placeholder="https://example.com/rss.xml"
            required
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            className="flex-1 min-w-[16rem] border border-border rounded px-3 py-2 text-sm bg-background"
          />
          <input
            type="text"
            placeholder="Title (auto-detected if left blank)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="flex-1 min-w-[10rem] border border-border rounded px-3 py-2 text-sm bg-background"
          />
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="flex-1 min-w-[10rem] border border-border rounded px-3 py-2 text-sm bg-background"
          >
            <option value="">{UNCATEGORIZED}</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-accent text-accent-foreground px-4 py-2 text-sm disabled:opacity-50"
          >
            Add feed
          </button>
        </div>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <CategoryManager categories={categories} />

      <div className="flex items-center gap-2 text-sm overflow-x-auto pb-1">
        {filterOptions.map((category) => {
          const active = categoryFilter === category
          return (
            <button
              key={category}
              type="button"
              onClick={() => setCategoryFilter(category)}
              className={
                active
                  ? 'shrink-0 rounded-full bg-accent text-accent-foreground px-3 py-1 text-xs font-medium'
                  : 'shrink-0 rounded-full border border-border text-muted px-3 py-1 text-xs font-medium hover:bg-foreground/5'
              }
            >
              {category === 'all' ? 'All' : category}
            </button>
          )
        })}
      </div>

      {visibleFeeds.length === 0 ? (
        <p className="text-sm text-muted">No feeds yet.</p>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-lg">
          {visibleFeeds.map((feed) => (
            <li key={feed.id} className="p-4">
              {editingId === feed.id ? (
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="flex-1 min-w-[10rem] border border-border rounded px-3 py-1.5 text-sm bg-background"
                  />
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="flex-1 min-w-[10rem] border border-border rounded px-3 py-1.5 text-sm bg-background"
                  >
                    <option value="">{UNCATEGORIZED}</option>
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleSaveEdit(feed.id)}
                    className="rounded-full bg-accent text-accent-foreground px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="text-sm text-muted"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{feed.title}</span>
                      <span className="text-xs rounded-full bg-foreground/5 text-muted px-2 py-0.5">
                        {feed.category || UNCATEGORIZED}
                      </span>
                    </div>
                    <a
                      href={feed.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted hover:underline truncate block"
                    >
                      {feed.url}
                    </a>
                    <p className="text-xs text-muted mt-0.5">
                      Last fetched: {formatDate(feed.last_fetched_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(feed)}
                      className="text-sm text-muted hover:text-foreground"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => handleRemove(feed.id)}
                      className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
