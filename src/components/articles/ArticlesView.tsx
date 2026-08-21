'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ArticleItem, ArticlesPageFilters } from '@/lib/dashboard/data'
import { saveArticle, ignoreArticle, clearArticleState, fetchArticlesPage } from '@/lib/articles/actions'
import ArticleNoteEditor from './ArticleNoteEditor'
import ArticleTagEditor from './ArticleTagEditor'

export interface ArticlesFilters {
  query: string
  category: string | null
  tag: string | null
  savedOnly: boolean
}

function formatDate(dateString: string | null): string | null {
  if (!dateString) return null
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function buildUrl(filters: ArticlesFilters): string {
  const params = new URLSearchParams()
  if (filters.query) params.set('q', filters.query)
  if (filters.category) params.set('category', filters.category)
  if (filters.tag) params.set('tag', filters.tag)
  if (filters.savedOnly) params.set('saved', '1')
  const qs = params.toString()
  return qs ? `/articles?${qs}` : '/articles'
}

export default function ArticlesView({
  items,
  nextCursor,
  categories,
  savedTags,
  filters,
}: {
  items: ArticleItem[]
  nextCursor: { publishedAt: string; id: string } | null
  categories: string[]
  savedTags: string[]
  filters: ArticlesFilters
}) {
  const router = useRouter()
  const [queryDraft, setQueryDraft] = useState(filters.query)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [errorId, setErrorId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  // Optimistic local copy for per-item actions — see ArticleList.tsx for
  // why. Also where "Load more" pages get appended, since accumulating
  // them lives outside what the server-rendered `items` prop tracks.
  const [localItems, setLocalItems] = useState(items)
  const [cursor, setCursor] = useState(nextCursor)
  const [syncedFrom, setSyncedFrom] = useState(items)
  if (items !== syncedFrom) {
    setSyncedFrom(items)
    setLocalItems(items)
    setCursor(nextCursor)
  }

  function updateItem(id: string, patch: Partial<ArticleItem>) {
    setLocalItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  function removeItem(id: string) {
    setLocalItems((prev) => prev.filter((item) => item.id !== id))
  }

  function navigate(patch: Partial<ArticlesFilters>) {
    router.push(buildUrl({ ...filters, ...patch }))
  }

  function commitSearch() {
    if (queryDraft.trim() !== filters.query) navigate({ query: queryDraft.trim() })
  }

  async function handleLoadMore() {
    if (!cursor) return
    setLoadingMore(true)
    const filterArg: ArticlesPageFilters = {
      query: filters.query || undefined,
      category: filters.category,
      tag: filters.tag,
      savedOnly: filters.savedOnly,
      cursor,
    }
    const result = await fetchArticlesPage(filterArg)
    setLoadingMore(false)
    setLocalItems((prev) => [...prev, ...result.items])
    setCursor(result.nextCursor)
  }

  async function handleSave(id: string) {
    setPendingId(id)
    setError(null)
    updateItem(id, { state: 'saved' })
    const result = await saveArticle(id)
    setPendingId(null)
    if (result.error) {
      setErrorId(id)
      setError(result.error)
      return
    }
    router.refresh()
  }

  async function handleIgnore(id: string) {
    setPendingId(id)
    setError(null)
    removeItem(id)
    const result = await ignoreArticle(id)
    setPendingId(null)
    if (result.error) {
      setErrorId(id)
      setError(result.error)
      return
    }
    router.refresh()
  }

  async function handleUnsave(id: string) {
    setPendingId(id)
    setError(null)
    if (filters.savedOnly) {
      removeItem(id)
    } else {
      updateItem(id, { state: null })
    }
    const result = await clearArticleState(id)
    setPendingId(null)
    if (result.error) {
      setErrorId(id)
      setError(result.error)
      return
    }
    router.refresh()
  }

  const activeFilterCount =
    (filters.query ? 1 : 0) + (filters.category ? 1 : 0) + (filters.tag ? 1 : 0) + (filters.savedOnly ? 1 : 0)

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
          value={filters.category ?? ''}
          onChange={(e) => navigate({ category: e.target.value || null })}
          className="border border-border px-3 py-2 text-sm bg-background"
        >
          <option value="">All categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={filters.savedOnly}
            onChange={(e) => navigate({ savedOnly: e.target.checked, tag: e.target.checked ? filters.tag : null })}
          />
          Saved only
        </label>
      </div>

      {savedTags.length > 0 && (
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
          {savedTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => navigate({ tag, savedOnly: true })}
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

      {error && <p className="text-sm text-red-600">{error}</p>}

      {localItems.length === 0 ? (
        <p className="text-sm text-muted">
          {activeFilterCount > 0 ? 'No articles match your filters.' : 'No articles yet.'}
        </p>
      ) : (
        <ul className="divide-y divide-border border border-border">
          {localItems.map((item) => (
            <li key={item.id} className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted mb-0.5">
                {item.feed_title && <span className="font-medium">{item.feed_title}</span>}
                {item.category && <span>{item.category}</span>}
                {formatDate(item.published_at) && <span>{formatDate(item.published_at)}</span>}
              </div>
              {item.link ? (
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium hover:text-accent hover:underline"
                >
                  {item.title}
                </a>
              ) : (
                <p className="text-sm font-medium">{item.title}</p>
              )}
              {item.summary && (
                <p className="text-sm text-muted mt-0.5 line-clamp-2">{item.summary}</p>
              )}
              <div className="flex items-center gap-3 mt-1">
                {item.state === 'saved' ? (
                  <button
                    type="button"
                    disabled={pendingId === item.id}
                    onClick={() => handleUnsave(item.id)}
                    className="text-xs text-muted hover:text-accent transition-colors disabled:opacity-50"
                  >
                    Unsave
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={pendingId === item.id}
                    onClick={() => handleSave(item.id)}
                    className="text-xs text-muted hover:text-accent transition-colors disabled:opacity-50"
                  >
                    Save
                  </button>
                )}
                {item.state !== 'ignored' && (
                  <button
                    type="button"
                    disabled={pendingId === item.id}
                    onClick={() => handleIgnore(item.id)}
                    className="text-xs text-muted hover:text-accent transition-colors disabled:opacity-50"
                  >
                    Ignore
                  </button>
                )}
              </div>
              {item.state === 'saved' && (
                <>
                  <ArticleNoteEditor
                    itemId={item.id}
                    note={item.note}
                    onChange={(note) => updateItem(item.id, { note })}
                  />
                  <ArticleTagEditor
                    itemId={item.id}
                    tags={item.tags}
                    onChange={(tags) => updateItem(item.id, { tags })}
                  />
                </>
              )}
              {errorId === item.id && error && <p className="text-xs text-red-600 mt-1">{error}</p>}
            </li>
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
