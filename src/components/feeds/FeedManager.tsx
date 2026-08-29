'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, X } from 'lucide-react'
import {
  addFeed,
  updateFeed,
  removeFeed,
  runIngestNow,
  setFeedSummarizeArticles,
  setFeedTranslateEnabled,
} from '@/lib/feeds/actions'
import { assignFeedToFolders } from '@/lib/folders/actions'
import type { FeedRow } from '@/lib/feeds/data'
import type { IngestSummary } from '@/lib/feeds/ingest'
import type { EngagementRate } from '@/lib/feeds/engagement'
import type { TagCount } from '@/lib/tags/data'
import { usePreferences } from '@/components/preferences/PreferencesProvider'
import { formatDateTime } from '@/lib/formatting'
import FolderManager from './FolderManager'
import type { FolderRow } from '@/lib/folders/data'
import OpmlImport from './OpmlImport'
import BuildFeedSection from './BuildFeedSection'
import TagManager from './TagManager'

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
  tags,
}: {
  feeds: FeedRow[]
  folders: { id: string; label: string }[]
  folderRows: FolderRow[]
  engagement: Record<string, EngagementRate>
  tags: TagCount[]
}) {
  const router = useRouter()
  const { timezone, clockFormat } = usePreferences()
  const formatDate = (dateString: string | null) => formatDateTime(dateString, { timezone, clockFormat }) ?? 'never'
  const [feedsExpanded, setFeedsExpanded] = useState(false)
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
    const result = await addFeed({
      url: newUrl,
      title: newTitle,
      category: null,
    })
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

  // Toggled directly from the list — no Edit-mode round trip needed, since
  // this is the one setting worth flipping per-article-cost-consciously on
  // its own (see setFeedSummarizeArticles in src/lib/feeds/actions.ts).
  async function handleToggleSummarize(feed: FeedRow) {
    const next = !feed.summarize_articles
    setLocalFeeds((prev) =>
      prev.map((f) => (f.id === feed.id ? { ...f, summarize_articles: next } : f))
    )
    const result = await setFeedSummarizeArticles(feed.id, next)
    if (result.error) {
      setError(result.error)
      setLocalFeeds((prev) =>
        prev.map((f) => (f.id === feed.id ? { ...f, summarize_articles: feed.summarize_articles } : f))
      )
      return
    }
    router.refresh()
  }

  // Same pattern as handleToggleSummarize above — no Edit-mode round trip.
  // Unchecking this is a promise that this feed never needs translation
  // (see setFeedTranslateEnabled), which is also what lets runIngest
  // safely pre-cache this feed's future articles.
  async function handleToggleTranslate(feed: FeedRow) {
    const next = !feed.translate_enabled
    setLocalFeeds((prev) =>
      prev.map((f) => (f.id === feed.id ? { ...f, translate_enabled: next } : f))
    )
    const result = await setFeedTranslateEnabled(feed.id, next)
    if (result.error) {
      setError(result.error)
      setLocalFeeds((prev) =>
        prev.map((f) => (f.id === feed.id ? { ...f, translate_enabled: feed.translate_enabled } : f))
      )
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
          <h2 className="text-lg font-bold">Run ingest now</h2>
          <p className="text-base text-muted mt-0.5">
            Fetches new items published in the last 24 hours for every feed, instead of waiting
            for the cron job.
          </p>
          {ingestSummary && (
            <div className="text-base text-muted mt-1">
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
                    <li key={failure.feedId} className="text-danger">
                      {failure.url}: {failure.error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {ingestError && <p className="text-base text-danger mt-1">{ingestError}</p>}
        </div>
        <button
          type="button"
          onClick={handleRunIngest}
          disabled={ingesting}
          className="border border-border px-4 py-2 text-base hover:bg-foreground/5 transition-colors disabled:opacity-50 shrink-0"
        >
          {ingesting ? 'Running…' : 'Run ingest now'}
        </button>
      </div>

      <form onSubmit={handleAdd} className="card-elevated p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Add a feed</h2>
          <OpmlImport />
        </div>
        <div className="flex flex-wrap gap-3">
          <input
            type="url"
            placeholder="https://example.com/rss.xml"
            required
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            className="flex-1 min-w-[16rem] border border-border px-3 py-2 text-lg bg-background"
          />
          <input
            type="text"
            placeholder="Title (auto-detected if left blank)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="flex-1 min-w-[10rem] border border-border px-3 py-2 text-lg bg-background"
          />
          <select
            value={newFolderIds[0] ?? ''}
            onChange={(e) => setNewFolderIds(e.target.value ? [e.target.value] : [])}
            className="flex-1 min-w-[10rem] border border-border px-3 py-2 text-lg bg-background"
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
            className="bg-foreground text-background px-4 py-2 text-base transition-colors hover:opacity-90 disabled:opacity-50"
          >
            Add feed
          </button>
        </div>
      </form>

      {error && <p className="text-lg text-danger">{error}</p>}

      <BuildFeedSection folders={folders} onCreated={handleFeedBuilt} />

      <TagManager tags={tags} />

      <FolderManager folders={folderRows} />

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setFeedsExpanded((prev) => !prev)}
          aria-expanded={feedsExpanded}
          className="flex items-center gap-2 text-left"
        >
          <ChevronRight
            size={18}
            strokeWidth={1.75}
            className={`shrink-0 text-muted transition-transform ${feedsExpanded ? 'rotate-90' : ''}`}
            aria-hidden="true"
          />
          <h2 className="text-lg font-bold">Manage feeds</h2>
        </button>

        {feedsExpanded && (
          <>
            <div className="flex items-center gap-2 text-lg overflow-x-auto pb-1">
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
                        ? 'shrink-0 border border-accent text-accent bg-accent/10 px-3 py-1 text-base font-medium transition-colors'
                        : 'shrink-0 border border-border text-muted px-3 py-1 text-base font-medium hover:border-accent hover:text-accent transition-colors'
                    }
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>

            {visibleFeeds.length === 0 ? (
              <p className="text-lg text-muted">No feeds yet.</p>
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
                          className="flex-1 min-w-[10rem] border border-border px-3 py-1.5 text-lg bg-background"
                        />
                        <select
                          value={editFolderIds[0] ?? ''}
                          onChange={(e) => setEditFolderIds(e.target.value ? [e.target.value] : [])}
                          className="flex-1 min-w-[10rem] border border-border px-3 py-1.5 text-lg bg-background"
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
                          className="bg-foreground text-background px-3 py-1.5 text-base transition-colors hover:opacity-90 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="text-base text-muted hover:text-accent transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-lg">{feed.title}</span>
                            {feed.is_scraped && (
                              <span
                                className="text-base bg-accent/10 text-accent px-2 py-0.5"
                                title="Built from a page with no RSS feed of its own — re-scraped on every ingest"
                              >
                                Built
                              </span>
                            )}
                            <span className="text-base bg-foreground/5 text-muted px-2 py-0.5">
                              {folderLabelsFor(feed.folderIds, folders)}
                            </span>
                            <span
                              className="text-base text-muted"
                              title="Rolling 7-day read rate: articles you've read from this feed ÷ articles it produced"
                            >
                              Engagement: {formatRate(engagement[feed.id])}
                            </span>
                          </div>
                          <a
                            href={feed.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-base text-muted hover:underline truncate block"
                          >
                            {feed.url}
                          </a>
                          <p className="text-base text-muted mt-0.5">
                            Last fetched: {formatDate(feed.last_fetched_at)}
                          </p>
                          {feed.last_error && (
                            <p className="text-base text-danger mt-0.5">
                              {feed.consecutive_failures >= 3 ? (
                                <span className="border border-danger text-danger px-1 py-0.5 mr-1 font-medium">
                                  Failing {feed.consecutive_failures}x
                                </span>
                              ) : (
                                '⚠ '
                              )}
                              {feed.last_error}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <label
                            className="flex items-center gap-1.5 text-base text-muted"
                            title="Generate an AI summary for each new article from this feed"
                          >
                            <input
                              type="checkbox"
                              checked={feed.summarize_articles}
                              onChange={() => handleToggleSummarize(feed)}
                            />
                            AI summary
                          </label>
                          <label
                            className="flex items-center gap-1.5 text-base text-muted"
                            title="Uncheck if this feed's articles never need translation — lets Parable pre-cache new articles from it for faster opening"
                          >
                            <input
                              type="checkbox"
                              checked={feed.translate_enabled}
                              onChange={() => handleToggleTranslate(feed)}
                            />
                            Translate
                          </label>
                          <button
                            type="button"
                            onClick={() => startEdit(feed)}
                            className="text-base text-muted hover:text-accent transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => handleRemove(feed.id)}
                            aria-label="Remove feed"
                            title="Remove feed"
                            className="text-accent hover:opacity-80 transition-colors disabled:opacity-50"
                          >
                            <X size={16} strokeWidth={1.75} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  )
}
