'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ArticleItem, ArticlesPageFilters } from '@/lib/dashboard/data'
import { fetchArticlesPage } from '@/lib/articles/actions'
import { useOptimisticArticleList } from './useOptimisticArticleList'
import ArticleCard, { type FolderOption } from './ArticleCard'

export type ArticlesViewMode = 'unfiled' | 'saved' | 'archived'

export interface ArticlesFilters {
  query: string
  view: ArticlesViewMode
  folderId: string | null
  sourceFeedId: string | null
  tag: string | null
  dateFrom: string | null
  dateTo: string | null
}

function buildUrl(basePath: string, filters: ArticlesFilters): string {
  const params = new URLSearchParams()
  if (filters.query) params.set('q', filters.query)
  if (filters.folderId) params.set('folder', filters.folderId)
  if (filters.sourceFeedId) params.set('source', filters.sourceFeedId)
  if (filters.tag) params.set('tag', filters.tag)
  if (filters.dateFrom) params.set('from', filters.dateFrom)
  if (filters.dateTo) params.set('to', filters.dateTo)
  const qs = params.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

// Powers the Articles, Saved, and Archive pages — each passes its own
// `view` (which server-side query getArticlesPage runs) and `basePath` (so
// filter navigation stays on that page). Save/Archive/Delete affordances
// per card are the same shared ArticleCard; only Saved shows the folder
// picker and Delete button, per the plan's explicit Saved-page requirement.
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
}) {
  const router = useRouter()
  const [queryDraft, setQueryDraft] = useState(filters.query)
  const [loadingMore, setLoadingMore] = useState(false)

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
  }

  function navigate(patch: Partial<ArticlesFilters>) {
    router.push(buildUrl(basePath, { ...filters, ...patch }))
  }

  function commitSearch() {
    if (queryDraft.trim() !== filters.query) navigate({ query: queryDraft.trim() })
  }

  async function handleLoadMore() {
    if (!cursor) return
    setLoadingMore(true)
    const filterArg: ArticlesPageFilters = {
      query: filters.query || undefined,
      view: filters.view,
      folderId: filters.folderId,
      sourceFeedId: filters.sourceFeedId,
      tag: filters.tag,
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
    (filters.folderId ? 1 : 0) +
    (filters.sourceFeedId ? 1 : 0) +
    (filters.tag ? 1 : 0) +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0)

  return (
    <div className="space-y-4">
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
          className="flex-1 min-w-[16rem] border border-border px-3 py-2 text-sm bg-background"
        />
        <select
          value={filters.folderId ?? ''}
          onChange={(e) => navigate({ folderId: e.target.value || null })}
          className="border border-border px-3 py-2 text-sm bg-background"
        >
          <option value="">All folders</option>
          {localFolders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.label}
            </option>
          ))}
        </select>
        <select
          value={filters.sourceFeedId ?? ''}
          onChange={(e) => navigate({ sourceFeedId: e.target.value || null })}
          className="border border-border px-3 py-2 text-sm bg-background"
        >
          <option value="">All sources</option>
          {feedOptions.map((feed) => (
            <option key={feed.id} value={feed.id}>
              {feed.title ?? feed.id}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-muted">
          From
          <input
            type="date"
            value={filters.dateFrom ?? ''}
            onChange={(e) => navigate({ dateFrom: e.target.value || null })}
            className="border border-border px-3 py-2 text-sm bg-background text-foreground"
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-muted">
          To
          <input
            type="date"
            value={filters.dateTo ?? ''}
            onChange={(e) => navigate({ dateTo: e.target.value || null })}
            className="border border-border px-3 py-2 text-sm bg-background text-foreground"
          />
        </label>
      </div>

      {allTags.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => navigate({ tag: null })}
            className={
              filters.tag === null
                ? 'shrink-0 border border-accent text-accent bg-accent/10 px-2.5 py-1 transition-colors'
                : 'shrink-0 border border-border text-muted px-2.5 py-1 hover:border-accent hover:text-accent transition-colors'
            }
          >
            All tags
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => navigate({ tag })}
              className={
                filters.tag === tag
                  ? 'shrink-0 border border-accent text-accent bg-accent/10 px-2.5 py-1 transition-colors'
                  : 'shrink-0 border border-border text-muted px-2.5 py-1 hover:border-accent hover:text-accent transition-colors'
              }
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {localItems.length === 0 ? (
        <p className="text-sm text-muted">
          {activeFilterCount > 0 ? 'No articles match your filters.' : 'No articles yet.'}
        </p>
      ) : (
        <ul className="divide-y divide-border border border-border">
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
            className="border border-border px-4 py-2 text-sm hover:bg-foreground/5 transition-colors disabled:opacity-50"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}
