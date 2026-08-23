'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { addFeed, updateFeed, removeFeed, runIngestNow } from '@/lib/feeds/actions'
import { assignFeedToFolders } from '@/lib/folders/actions'
import type { FeedRow } from '@/lib/feeds/data'
import type { IngestSummary } from '@/lib/feeds/ingest'
import type { EngagementRate } from '@/lib/feeds/engagement'
import { usePreferences } from '@/components/preferences/PreferencesProvider'
import { formatDateTime } from '@/lib/formatting'
import FolderManager from './FolderManager'
import type { FolderRow } from '@/lib/folders/data'
import OpmlImport from './OpmlImport'
import BuildFeedSection from './BuildFeedSection'

const NO_FOLDER = 'No folder'

function folderLabelsFor(folderIds: string[], folders: { id: string; label: string }[]): string {
  if (folderIds.length === 0) return NO_FOLDER
  const byId = new Map(folders.map((f) => [f.id, f.label]))
  return folderIds.map((id) => byId.get(id) ?? id).join(', ')
}

function formatRate(rate: EngagementRate | undefined): string {
  if (!rate || rate.rate === null) return '—'
  return `${Math.round(rate.rate * 100)}%`
}

export default function FeedManager({
  feeds,
  folders,
  folderRows,
  engagement,
}: {
  feeds: FeedRow[]
  folders: { id: string; label: string }[]
  folderRows: FolderRow[]
  engagement: Record<string, EngagementRate>
}) {
  const router = useRouter()
  const { timezone, clockFormat } = usePreferences()
  const formatDate = (dateString: string | null) => formatDateTime(dateString, { timezone, clockFormat }) ?? 'never'
  const [folderFilter, setFolderFilter] = useState<string>('all')
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
  const [newFolderIds, setNewFolderIds] = useState<string[]>([])

  const [editTitle, setEditTitle] = useState('')
  const [editFolderIds, setEditFolderIds] = useState<string[]>([])

  const [ingesting, setIngesting] = useState(false)
  const [ingestSummary, setIngestSummary] = useState<IngestSummary | null>(null)
  const [ingestError, setIngestError] = useState<string | null>(null)

  const visibleFeeds = localFeeds.filter((feed) => {
    if (folderFilter === 'all') return true
    if (folderFilter === 'uncategorized') return feed.folderIds.length === 0
    return feed.folderIds.includes(folderFilter)
  })

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    const result = await addFeed({ url: newUrl, title: newTitle, category: null })
    if (result.error !== null) {
      setPending(false)
      setError(result.error)
      return
    }
    if (newFolderIds.length > 0) {
      await assignFeedToFolders(result.feed.id, newFolderIds)
    }
    setPending(false)
    setLocalFeeds((prev) => [...prev, { ...result.feed, folderIds: newFolderIds }])
    setNewUrl('')
    setNewTitle('')
    setNewFolderIds([])
    router.refresh()
  }

  async function handleFeedBuilt(feed: FeedRow, folderIds: string[]) {
    if (folderIds.length > 0) {
      await assignFeedToFolders(feed.id, folderIds)
    }
    setLocalFeeds((prev) => [...prev, { ...feed, folderIds }])
    router.refresh()
  }

  function startEdit(feed: FeedRow) {
    setEditingId(feed.id)
    setEditTitle(feed.title)
    setEditFolderIds(feed.folderIds)
    setError(null)
  }

  async function handleSaveEdit(id: string) {
    setPending(true)
    setError(null)
    const title = editTitle.trim()
    setLocalFeeds((prev) =>
      prev.map((feed) => (feed.id === id ? { ...feed, title, folderIds: editFolderIds } : feed))
    )
    setEditingId(null)
    const [titleResult, folderResult] = await Promise.all([
      updateFeed(id, { title: editTitle, category: null }),
      assignFeedToFolders(id, editFolderIds),
    ])
    setPending(false)
    if (titleResult.error) {
      setError(titleResult.error)
      return
    }
    if (folderResult.error) {
      setError(folderResult.error)
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
      <div className="flex items-center justify-between pb-6 border-b border-border">
        <div>
          <h2 className="text-sm font-medium">Run ingest now</h2>
          <p className="text-xs text-muted mt-0.5">
            Fetches new items published in the last 24 hours for every feed, instead of waiting
            for the cron job.
          </p>
          {ingestSummary && (
            <div className="text-xs text-muted mt-1">
              <p>
                Processed {ingestSummary.feedsProcessed} feed
                {ingestSummary.feedsProcessed === 1 ? '' : 's'}, added{' '}
                {ingestSummary.itemsInserted} new item
                {ingestSummary.itemsInserted === 1 ? '' : 's'}
                {ingestSummary.itemsAutoDeleted > 0 && (
                  <>
                    , auto-deleted {ingestSummary.itemsAutoDeleted} item
                    {ingestSummary.itemsAutoDeleted === 1 ? '' : 's'}
                  </>
                )}
                .
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
          className="border border-border px-4 py-2 text-sm hover:bg-foreground/5 transition-colors disabled:opacity-50 shrink-0"
        >
          {ingesting ? 'Running…' : 'Run ingest now'}
        </button>
      </div>

      <form onSubmit={handleAdd} className="card-elevated p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">Add a feed</h2>
          <OpmlImport />
        </div>
        <div className="flex flex-wrap gap-3">
          <input
            type="url"
            placeholder="https://example.com/rss.xml"
            required
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            className="flex-1 min-w-[16rem] border border-border px-3 py-2 text-sm bg-background"
          />
          <input
            type="text"
            placeholder="Title (auto-detected if left blank)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="flex-1 min-w-[10rem] border border-border px-3 py-2 text-sm bg-background"
          />
          <select
            value={newFolderIds[0] ?? ''}
            onChange={(e) => setNewFolderIds(e.target.value ? [e.target.value] : [])}
            className="flex-1 min-w-[10rem] border border-border px-3 py-2 text-sm bg-background"
          >
            <option value="">{NO_FOLDER}</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={pending}
            className="bg-foreground text-background px-4 py-2 text-sm transition-colors hover:opacity-90 disabled:opacity-50"
          >
            Add feed
          </button>
        </div>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <BuildFeedSection folders={folders} onCreated={handleFeedBuilt} />

      <FolderManager folders={folderRows} />

      <div className="flex items-center gap-2 text-sm overflow-x-auto pb-1">
        {[
          { id: 'all', label: 'All' },
          { id: 'uncategorized', label: NO_FOLDER },
          ...folders,
        ].map((option) => {
          const active = folderFilter === option.id
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setFolderFilter(option.id)}
              className={
                active
                  ? 'shrink-0 border border-accent text-accent bg-accent/10 px-3 py-1 text-xs font-medium transition-colors'
                  : 'shrink-0 border border-border text-muted px-3 py-1 text-xs font-medium hover:border-accent hover:text-accent transition-colors'
              }
            >
              {option.label}
            </button>
          )
        })}
      </div>

      {visibleFeeds.length === 0 ? (
        <p className="text-sm text-muted">No feeds yet.</p>
      ) : (
        <ul className="card-elevated divide-y divide-border">
          {visibleFeeds.map((feed) => (
            <li key={feed.id} className="p-4">
              {editingId === feed.id ? (
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="flex-1 min-w-[10rem] border border-border px-3 py-1.5 text-sm bg-background"
                  />
                  <select
                    value={editFolderIds[0] ?? ''}
                    onChange={(e) => setEditFolderIds(e.target.value ? [e.target.value] : [])}
                    className="flex-1 min-w-[10rem] border border-border px-3 py-1.5 text-sm bg-background"
                  >
                    <option value="">{NO_FOLDER}</option>
                    {folders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleSaveEdit(feed.id)}
                    className="bg-foreground text-background px-3 py-1.5 text-sm transition-colors hover:opacity-90 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="text-sm text-muted hover:text-accent transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{feed.title}</span>
                      {feed.is_scraped && (
                        <span
                          className="text-xs bg-accent/10 text-accent px-2 py-0.5"
                          title="Built from a page with no RSS feed of its own — re-scraped on every ingest"
                        >
                          Built
                        </span>
                      )}
                      <span className="text-xs bg-foreground/5 text-muted px-2 py-0.5">
                        {folderLabelsFor(feed.folderIds, folders)}
                      </span>
                      <span
                        className="text-xs text-muted"
                        title="Rolling 7-day read rate: articles you've read from this feed ÷ articles it produced"
                      >
                        Engagement: {formatRate(engagement[feed.id])}
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
                    {feed.last_error && (
                      <p className="text-xs text-red-600 mt-0.5">
                        ⚠ Failing: {feed.last_error}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(feed)}
                      className="text-sm text-muted hover:text-accent transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => handleRemove(feed.id)}
                      className="text-sm text-red-600 hover:text-red-800 transition-colors disabled:opacity-50"
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
