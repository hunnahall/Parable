'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LayoutList, LayoutGrid } from 'lucide-react'
import type { ArticleItem, ArticlesPageFilters } from '@/lib/articles/list'
import { fetchArticlesPage, archiveArticlesBulk, purgeArticles } from '@/lib/articles/actions'
import { useOptimisticArticleList } from './useOptimisticArticleList'
import ArticleCard, { type FolderOption } from './ArticleCard'
import ArticleCardGrid from './ArticleCardGrid'
import MultiSelectDropdown from '@/components/ui/MultiSelectDropdown'
import Button from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import EmptyState from '@/components/ui/EmptyState'

export type ArticlesDisplayMode = 'list' | 'card'

export interface ArticlesFilters {
  query: string
  folderIds: string[]
  sourceFeedIds: string[]
  display: ArticlesDisplayMode
}

function buildUrl(basePath: string, filters: ArticlesFilters): string {
  const params = new URLSearchParams()
  if (filters.query) params.set('q', filters.query)
  if (filters.folderIds.length > 0) params.set('folder', filters.folderIds.join(','))
  if (filters.sourceFeedIds.length > 0) params.set('source', filters.sourceFeedIds.join(','))
  // Cards are the default (Saved is browse-and-keep), so only List is
  // written to the URL.
  if (filters.display !== 'card') params.set('display', filters.display)
  const qs = params.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

// The Saved page: saved articles, paginated, with search, folder and source
// filters, cards or a list, and a multi-select toolbar (Archive selected;
// Delete selected, which removes them from this account for good, see
// purgeArticles). The folder picker on each article is what files it, and
// so what keeps it saved. Before stories (2026-10-20) this also powered the
// Inbox and Archive; those modes are gone.
export default function ArticlesView({
  basePath,
  items,
  nextCursor,
  folders,
  feedOptions,
  filters,
}: {
  basePath: string
  items: ArticleItem[]
  nextCursor: { publishedAt: string; id: string } | null
  folders: FolderOption[]
  feedOptions: { id: string; title: string | null }[]
  filters: ArticlesFilters
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

  // Archiving or unfiling an article takes it off Saved.
  function belongs(item: ArticleItem): boolean {
    return item.state === 'saved'
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

  // The server query for the current filters, for Load more and Select all.
  function pageFilters(): ArticlesPageFilters {
    return {
      query: filters.query || undefined,
      folderIds: filters.folderIds,
      sourceFeedIds: filters.sourceFeedIds,
    }
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
      const result = await fetchArticlesPage({ ...pageFilters(), cursor: pageCursor })
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
    const result = await fetchArticlesPage({ ...pageFilters(), cursor })
    setLoadingMore(false)
    appendItems(result.items)
    setCursor(result.nextCursor)
  }

  const activeFilterCount =
    (filters.query ? 1 : 0) +
    (filters.folderIds.length > 0 ? 1 : 0) +
    (filters.sourceFeedIds.length > 0 ? 1 : 0)

  return (
    <div className="space-y-4">
      <div className="space-y-3 border-b border-border pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="search"
            placeholder="Search titles"
            value={queryDraft}
            onChange={(e) => setQueryDraft(e.target.value)}
            onBlur={commitSearch}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitSearch()
            }}
            className="min-w-[10rem] max-w-xs flex-1"
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
          <div className="cw-seg ml-auto" role="group" aria-label="Display">
            <button
              type="button"
              onClick={() => navigate({ display: 'list' })}
              aria-label="List view"
              title="List view"
              aria-pressed={filters.display === 'list'}
            >
              <LayoutList size={16} strokeWidth={1.5} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => navigate({ display: 'card' })}
              aria-label="Card view"
              title="Card view"
              aria-pressed={filters.display === 'card'}
            >
              <LayoutGrid size={16} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {localItems.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="cw-check">
            <input
              type="checkbox"
              checked={selectedIds.size > 0 && selectedIds.size === localItems.length}
              ref={(el) => {
                if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < localItems.length
              }}
              onChange={toggleSelectAll}
            />
            <span className="text-muted tabular-nums">
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
            </span>
          </label>
          {selectedIds.size > 0 && (
            <>
              <Button size="sm" variant="secondary" disabled={bulkPending} onClick={handleBulkArchive}>
                {archivingAllCount !== null ? `Archiving ${archivingAllCount}` : 'Archive selected'}
              </Button>
              <Button
                size="sm"
                variant={confirmingDelete ? 'danger-solid' : 'danger'}
                disabled={bulkPending}
                onClick={handleBulkDelete}
              >
                {confirmingDelete ? `Delete ${selectedIds.size} articles` : 'Delete selected'}
              </Button>
              {confirmingDelete && (
                <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(false)}>
                  Cancel
                </Button>
              )}
            </>
          )}
        </div>
      )}
      {bulkError && <p className="text-sm text-danger">{bulkError}</p>}

      {localItems.length === 0 ? (
        activeFilterCount > 0 ? (
          <EmptyState title="No matching articles">Try a different search or clear the filters.</EmptyState>
        ) : (
          <EmptyState art="saved" title="Nothing saved yet">
            Articles you save stay here until you delete them.
          </EmptyState>
        )
      ) : filters.display === 'card' ? (
        <div className="grid grid-cols-1 gap-4 min-[640px]:grid-cols-2 min-[1200px]:grid-cols-3">
          {localItems.map((item) => (
            <ArticleCardGrid
              key={item.id}
              item={item}
              onUpdate={updateItem}
              onRemove={removeItem}
              folders={localFolders}
              onFolderCreated={handleFolderCreated}
              showFolderPicker
              showDelete
              selected={selectedIds.has(item.id)}
              onToggleSelect={toggleSelect}
            />
          ))}
        </div>
      ) : (
        <ul className="card-elevated divide-y divide-border overflow-hidden">
          {localItems.map((item) => (
            <ArticleCard
              key={item.id}
              item={item}
              onUpdate={updateItem}
              onRemove={removeItem}
              folders={localFolders}
              onFolderCreated={handleFolderCreated}
              showFolderPicker
              showDelete
              selected={selectedIds.has(item.id)}
              onToggleSelect={toggleSelect}
            />
          ))}
        </ul>
      )}

      {cursor && (
        <div className="flex justify-center">
          <Button onClick={handleLoadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  )
}
