'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LayoutList, LayoutGrid } from 'lucide-react'
import type { ArticleItem, ArticlesPageFilters } from '@/lib/dashboard/data'
import {
  fetchArticlesPage,
  archiveArticlesBulk,
  purgeArticles,
  moveToReader,
} from '@/lib/articles/actions'
import { useOptimisticArticleList } from './useOptimisticArticleList'
import ArticleCard, { type FolderOption } from './ArticleCard'
import ArticleCardGrid from './ArticleCardGrid'
import MultiSelectDropdown from '@/components/ui/MultiSelectDropdown'

export type ArticlesViewMode = 'unfiled' | 'saved' | 'archived' | 'reading'
export type ArticlesDisplayMode = 'list' | 'card'

export interface ArticlesFilters {
  query: string
  view: ArticlesViewMode
  folderIds: string[]
  sourceFeedIds: string[]
  tagIds: string[]
  dateFrom: string | null
  dateTo: string | null
  display: ArticlesDisplayMode
}

function buildUrl(basePath: string, filters: ArticlesFilters): string {
  const params = new URLSearchParams()
  if (filters.query) params.set('q', filters.query)
  if (filters.folderIds.length > 0) params.set('folder', filters.folderIds.join(','))
  if (filters.sourceFeedIds.length > 0) params.set('source', filters.sourceFeedIds.join(','))
  if (filters.tagIds.length > 0) params.set('tags', filters.tagIds.join(','))
  if (filters.dateFrom) params.set('from', filters.dateFrom)
  if (filters.dateTo) params.set('to', filters.dateTo)
  if (filters.display !== 'list') params.set('display', filters.display)
  const qs = params.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

// Powers the Inbox, Read, Save, and Archive pages — each passes its own
// `view` (which server-side query getArticlesPage runs) and `basePath` (so
// filter navigation stays on that page). Save/Archive affordances per card
// are the same shared ArticleCard; only Save and Read show the folder
// picker. Inbox is the odd one out: its cards have no reading-view link
// (showReaderLink={false} below) and get a "Read" action instead, plus the
// toolbar's bulk "Read" button. Per-card deletion only exists on Archive
// (showDelete) — everywhere else, deleting is a bulk-only action scoped to
// Archive's "Delete selected".
export default function ArticlesView({
  basePath,
  items,
  nextCursor,
  folders,
  feedOptions,
  allTags,
  filters,
  showFolderPicker = false,
  showDelete = false,
  showDateFilters = true,
  showTagsDropdown = false,
  enableBulkActions = false,
}: {
  basePath: string
  items: ArticleItem[]
  nextCursor: { publishedAt: string; id: string } | null
  folders: FolderOption[]
  feedOptions: { id: string; title: string | null }[]
  allTags: string[]
  filters: ArticlesFilters
  showFolderPicker?: boolean
  showDelete?: boolean
  // Archive keeps the From/To date pickers in its toolbar; Inbox, Read,
  // and Save drop them so the search bar, folder/source dropdowns, and
  // list/card toggle all fit on one aligned line.
  showDateFilters?: boolean
  // Read and Save only — an "All tags" multi-select alongside folders/
  // sources, replacing the single-select tag chips everywhere else used to
  // share.
  showTagsDropdown?: boolean
  // Multi-select toolbar (select all, plus whichever bulk action fits the
  // current view) — Inbox/Read/Save/Archive all opt in. "Archive selected"
  // shows on every view except Archive itself (nothing to do there); "Read
  // selected" only on Inbox (the only view with unfiled, state===null
  // items to move to Read); "Delete selected" is a full purge (see
  // purgeArticles) and only shown on Archive — the one place permanently
  // discarding a selection in bulk makes sense.
  enableBulkActions?: boolean
}) {
  const router = useRouter()
  const [queryDraft, setQueryDraft] = useState(filters.query)
  const [loadingMore, setLoadingMore] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // True only when the current selection came from "Select all" (the
  // header checkbox), as opposed to individually clicked rows — a bulk
  // archive triggered while this is true collects and archives every page
  // of the current filter, not just what's loaded on screen (see
  // handleBulkArchive below). Any manual per-item click clears it, falling
  // back to today's on-screen-only behavior.
  const [selectedAll, setSelectedAll] = useState(false)
  const [archivingAllCount, setArchivingAllCount] = useState<number | null>(null)
  const [bulkPending, setBulkPending] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Folders created inline from a card (see ArticleCard's "+ Add folder")
  // need to show up in every card's dropdown immediately, not just the one
  // that created it — kept here, one level up, rather than per-card state.
  const [localFolders, setLocalFolders] = useState(folders)
  const [syncedFoldersFrom, setSyncedFoldersFrom] = useState(folders)
  if (folders !== syncedFoldersFrom) {
    setSyncedFoldersFrom(folders)
    setLocalFolders(folders)
  }
  function handleFolderCreated(folder: FolderOption) {
    setLocalFolders((prev) => [...prev, folder].sort((a, b) => a.label.localeCompare(b.label)))
  }

  function belongs(item: ArticleItem): boolean {
    if (filters.view === 'unfiled') return item.state === null
    return item.state === filters.view
  }

  const { localItems, updateItem, removeItem, appendItems } = useOptimisticArticleList(items, belongs)
  const [cursor, setCursor] = useState(nextCursor)
  const [syncedCursorFrom, setSyncedCursorFrom] = useState(items)
  if (items !== syncedCursorFrom) {
    setSyncedCursorFrom(items)
    setCursor(nextCursor)
    // A new filter/page load replaces the list wholesale — stale
    // selection referring to ids that may no longer even be on screen.
    setSelectedIds(new Set())
    setSelectedAll(false)
    setConfirmingDelete(false)
  }

  function navigate(patch: Partial<ArticlesFilters>) {
    router.push(buildUrl(basePath, { ...filters, ...patch }))
  }

  function commitSearch() {
    if (queryDraft.trim() !== filters.query) navigate({ query: queryDraft.trim() })
  }

  function toggleSelect(id: string) {
    setConfirmingDelete(false)
    setSelectedAll(false)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setConfirmingDelete(false)
    setSelectedIds((prev) => {
      if (prev.size === localItems.length) {
        setSelectedAll(false)
        return new Set()
      }
      setSelectedAll(true)
      return new Set(localItems.map((item) => item.id))
    })
  }

  // "Select all" only ever selects what's loaded on screen. If more pages
  // exist (cursor is non-null) and the selection came from "Select all"
  // (not a manual partial pick), paginate through every remaining page
  // first so the whole filtered backlog gets archived in one go — see the
  // Inbox pagination bug this fixes: without this, "select all + archive"
  // only ever cleared the first loaded page, and the next page always
  // looked like a "new" batch of articles.
  async function collectAllMatchingIds(startingIds: string[]): Promise<string[]> {
    const allIds = [...startingIds]
    let pageCursor = cursor
    while (pageCursor) {
      const result = await fetchArticlesPage({
        query: filters.query || undefined,
        view: filters.view,
        folderIds: filters.folderIds,
        sourceFeedIds: filters.sourceFeedIds,
        tagIds: filters.tagIds,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        cursor: pageCursor,
      })
      allIds.push(...result.items.map((item) => item.id))
      setArchivingAllCount(allIds.length)
      pageCursor = result.nextCursor
    }
    return allIds
  }

  async function handleBulkArchive() {
    let ids = [...selectedIds]
    if (ids.length === 0) return
    setBulkPending(true)
    setBulkError(null)

    if (selectedAll && cursor) {
      setArchivingAllCount(ids.length)
      ids = await collectAllMatchingIds(ids)
    }

    for (const id of ids) updateItem(id, { state: 'archived', archivedAt: new Date().toISOString() })
    // Chunked to keep any single request reasonable-sized when "select
    // all" pulled in a large backlog.
    const CHUNK_SIZE = 200
    let error: string | null = null
    for (let i = 0; i < ids.length && !error; i += CHUNK_SIZE) {
      const result = await archiveArticlesBulk(ids.slice(i, i + CHUNK_SIZE))
      error = result.error
    }
    setBulkPending(false)
    setArchivingAllCount(null)
    setSelectedIds(new Set())
    setSelectedAll(false)
    if (error) {
      setBulkError(error)
      return
    }
    router.refresh()
  }

  async function handleBulkRead() {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    setBulkPending(true)
    setBulkError(null)
    for (const id of ids) updateItem(id, { state: 'reading', archivedAt: null })
    const result = await moveToReader(ids)
    setBulkPending(false)
    setSelectedIds(new Set())
    setSelectedAll(false)
    if (result.error) {
      setBulkError(result.error)
      return
    }
    router.refresh()
  }

  async function handleBulkDelete() {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      return
    }
    setBulkPending(true)
    setBulkError(null)
    for (const id of ids) removeItem(id)
    const result = await purgeArticles(ids)
    setBulkPending(false)
    setSelectedIds(new Set())
    setSelectedAll(false)
    setConfirmingDelete(false)
    if (result.error) {
      setBulkError(result.error)
      return
    }
    router.refresh()
  }

  async function handleLoadMore() {
    if (!cursor) return
    setLoadingMore(true)
    const filterArg: ArticlesPageFilters = {
      query: filters.query || undefined,
      view: filters.view,
      folderIds: filters.folderIds,
      sourceFeedIds: filters.sourceFeedIds,
      tagIds: filters.tagIds,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      cursor,
    }
    const result = await fetchArticlesPage(filterArg)
    setLoadingMore(false)
    appendItems(result.items)
    setCursor(result.nextCursor)
  }

  const activeFilterCount =
    (filters.query ? 1 : 0) +
    (filters.folderIds.length > 0 ? 1 : 0) +
    (filters.sourceFeedIds.length > 0 ? 1 : 0) +
    (filters.tagIds.length > 0 ? 1 : 0) +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0)

  return (
    <div className="space-y-4">
      <div className="space-y-3 pb-4 border-b border-border-subtle">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            placeholder="Search articles…"
            value={queryDraft}
            onChange={(e) => setQueryDraft(e.target.value)}
            onBlur={commitSearch}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitSearch()
            }}
            className="flex-1 min-w-[10rem] max-w-xs border border-border px-3 py-2 text-lg bg-background"
          />
          <MultiSelectDropdown
            label="All folders"
            options={localFolders.map((f) => ({ id: f.id, label: f.label }))}
            selectedIds={filters.folderIds}
            onChange={(folderIds) => navigate({ folderIds })}
            className="w-32"
          />
          <MultiSelectDropdown
            label="All sources"
            options={feedOptions.map((f) => ({ id: f.id, label: f.title ?? f.id }))}
            selectedIds={filters.sourceFeedIds}
            onChange={(sourceFeedIds) => navigate({ sourceFeedIds })}
            className="w-36"
          />
          {showTagsDropdown && (
            <MultiSelectDropdown
              label="All tags"
              options={allTags.map((tag) => ({ id: tag, label: tag }))}
              selectedIds={filters.tagIds}
              onChange={(tagIds) => navigate({ tagIds })}
              className="w-32"
            />
          )}
          {showDateFilters && (
            <>
              <label className="flex items-center gap-1.5 text-base text-muted">
                From
                <input
                  type="date"
                  value={filters.dateFrom ?? ''}
                  onChange={(e) => navigate({ dateFrom: e.target.value || null })}
                  className="border border-border px-3 py-2 text-lg bg-background text-foreground"
                />
              </label>
              <label className="flex items-center gap-1.5 text-base text-muted">
                To
                <input
                  type="date"
                  value={filters.dateTo ?? ''}
                  onChange={(e) => navigate({ dateTo: e.target.value || null })}
                  className="border border-border px-3 py-2 text-lg bg-background text-foreground"
                />
              </label>
            </>
          )}
          <div className="flex items-center border border-border ml-auto">
            <button
              type="button"
              onClick={() => navigate({ display: 'list' })}
              aria-label="List view"
              aria-pressed={filters.display === 'list'}
              className={
                'flex items-center justify-center w-8 h-8 transition-colors ' +
                (filters.display === 'list'
                  ? 'bg-foreground/10 text-foreground'
                  : 'text-muted hover:text-foreground')
              }
            >
              <LayoutList size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => navigate({ display: 'card' })}
              aria-label="Card view"
              aria-pressed={filters.display === 'card'}
              className={
                'flex items-center justify-center w-8 h-8 border-l border-border transition-colors ' +
                (filters.display === 'card'
                  ? 'bg-foreground/10 text-foreground'
                  : 'text-muted hover:text-foreground')
              }
            >
              <LayoutGrid size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {enableBulkActions && localItems.length > 0 && (
        <div className="flex items-center gap-3 text-lg">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={selectedIds.size > 0 && selectedIds.size === localItems.length}
              ref={(el) => {
                if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < localItems.length
              }}
              onChange={toggleSelectAll}
            />
            <span className="text-muted">
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
            </span>
          </label>
          {selectedIds.size > 0 && (
            <>
              {filters.view !== 'archived' && (
                <button
                  type="button"
                  disabled={bulkPending}
                  onClick={handleBulkArchive}
                  className="border border-danger text-danger px-3 py-1.5 text-sm hover:bg-danger/10 transition-colors disabled:opacity-50"
                >
                  {archivingAllCount !== null
                    ? `Archiving ${archivingAllCount}…`
                    : 'Archive selected'}
                </button>
              )}
              {filters.view === 'unfiled' && (
                <button
                  type="button"
                  disabled={bulkPending}
                  onClick={handleBulkRead}
                  className="border border-accent text-accent px-3 py-1.5 text-sm hover:bg-accent/10 transition-colors disabled:opacity-50"
                >
                  Read selected
                </button>
              )}
              {filters.view === 'archived' && (
                <button
                  type="button"
                  disabled={bulkPending}
                  onClick={handleBulkDelete}
                  className={
                    confirmingDelete
                      ? 'border border-danger bg-danger text-danger-foreground px-3 py-1.5 text-sm transition-colors disabled:opacity-50'
                      : 'border border-danger text-danger px-3 py-1.5 text-sm hover:bg-danger/10 transition-colors disabled:opacity-50'
                  }
                >
                  {confirmingDelete
                    ? `Really delete ${selectedIds.size}? Click to confirm`
                    : 'Delete selected'}
                </button>
              )}
              {confirmingDelete && (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="text-sm text-muted hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              )}
            </>
          )}
        </div>
      )}
      {bulkError && <p className="text-base text-danger">{bulkError}</p>}

      {localItems.length === 0 ? (
        <div className="relative py-16 text-center">
          <div className="empty-state-watermark" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/parable-mark.svg" alt="" className="w-40 h-40" />
          </div>
          <p className="relative text-lg text-muted">
            {activeFilterCount > 0 ? 'No articles match your filters.' : 'No articles yet.'}
          </p>
        </div>
      ) : filters.display === 'card' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {localItems.map((item) => (
            <ArticleCardGrid
              key={item.id}
              item={item}
              onUpdate={updateItem}
              onRemove={removeItem}
              folders={localFolders}
              onFolderCreated={handleFolderCreated}
              showFolderPicker={showFolderPicker}
              showDelete={showDelete}
              showReaderLink={filters.view !== 'unfiled'}
              selected={enableBulkActions ? selectedIds.has(item.id) : undefined}
              onToggleSelect={enableBulkActions ? toggleSelect : undefined}
            />
          ))}
        </div>
      ) : (
        <ul className="card-elevated divide-y divide-border">
          {localItems.map((item) => (
            <ArticleCard
              key={item.id}
              item={item}
              onUpdate={updateItem}
              onRemove={removeItem}
              folders={localFolders}
              onFolderCreated={handleFolderCreated}
              showFolderPicker={showFolderPicker}
              showDelete={showDelete}
              showReaderLink={filters.view !== 'unfiled'}
              selected={enableBulkActions ? selectedIds.has(item.id) : undefined}
              onToggleSelect={enableBulkActions ? toggleSelect : undefined}
            />
          ))}
        </ul>
      )}

      {cursor && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="border border-border px-4 py-2 text-base hover:bg-foreground/5 transition-colors disabled:opacity-50"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}
