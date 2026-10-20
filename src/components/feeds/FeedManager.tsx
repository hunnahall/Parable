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
import { assignFeedToFolders } from '@/lib/folders/actions'
import type { FeedRow } from '@/lib/feeds/data'
import type { IngestSummary } from '@/lib/feeds/ingest'
import type { EngagementRate } from '@/lib/feeds/engagement'
import { formatFetchedAt } from '@/lib/formatting'
import FolderManager from './FolderManager'
import type { FolderRow } from '@/lib/folders/data'
import BuildFeedSection from './BuildFeedSection'
import Button from '@/components/ui/Button'
import Badge, { Tag } from '@/components/ui/Badge'
import { Field, Input, Select } from '@/components/ui/Input'
import Tooltip from '@/components/ui/Tooltip'

const NO_FOLDER = 'No folder'

function folderLabelsFor(folderIds: string[], folders: { id: string; label: string }[]): string {
  if (folderIds.length === 0) return NO_FOLDER
  const byId = new Map(folders.map((f) => [f.id, f.label]))
  return folderIds.map((id) => byId.get(id) ?? id).join(', ')
}

function formatRate(rate: EngagementRate | undefined): string {
  if (!rate || rate.rate === null) return 'none yet'
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
      updateFeed(id, { title: editTitle }),
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
          <Field label="Folder" htmlFor="new-feed-folder">
            <Select
              id="new-feed-folder"
              value={newFolderIds[0] ?? ''}
              onChange={(e) => setNewFolderIds(e.target.value ? [e.target.value] : [])}
            >
              <option value="">{NO_FOLDER}</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.label}
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

      <BuildFeedSection folders={folders} onCreated={handleFeedBuilt} />

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

        <div className="overflow-x-auto border-b border-border px-4 py-3">
          <div className="cw-seg" role="group" aria-label="Show feeds in">
            {[{ id: 'all', label: 'All' }, { id: 'uncategorized', label: NO_FOLDER }, ...folders].map(
              (option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={folderFilter === option.id}
                  onClick={() => setFolderFilter(option.id)}
                >
                  {option.label}
                </button>
              )
            )}
          </div>
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
                    <Field label="Folder" htmlFor={`edit-folder-${feed.id}`}>
                      <Select
                        id={`edit-folder-${feed.id}`}
                        value={editFolderIds[0] ?? ''}
                        onChange={(e) => setEditFolderIds(e.target.value ? [e.target.value] : [])}
                      >
                        <option value="">{NO_FOLDER}</option>
                        {folders.map((folder) => (
                          <option key={folder.id} value={folder.id}>
                            {folder.label}
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
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-medium">{feed.title}</span>
                        {feed.is_scraped && <Tag>BUILT</Tag>}
                        <Tag>{folderLabelsFor(feed.folderIds, folders)}</Tag>
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
                        Last loaded {formatFetchedAt(feed.last_fetched_at)} · Opened{' '}
                        {formatRate(engagement[feed.id])}
                      </p>
                      {feed.last_error && <p className="text-xs text-danger">{feed.last_error}</p>}
                    </div>
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
