'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ArticleItem } from '@/lib/dashboard/data'
import { clearArticleState } from '@/lib/articles/actions'
import ArticleNoteEditor from './ArticleNoteEditor'
import ArticleTagEditor from './ArticleTagEditor'

function formatDate(dateString: string | null): string | null {
  if (!dateString) return null
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function SavedArticlesView({ items }: { items: ArticleItem[] }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Optimistic local copy — same reasoning as ArticleList.tsx: a full
  // page refresh is too slow to gate a tag edit or a removal on.
  const [localItems, setLocalItems] = useState(items)
  const [syncedFrom, setSyncedFrom] = useState(items)
  if (items !== syncedFrom) {
    setSyncedFrom(items)
    setLocalItems(items)
  }

  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const item of localItems) {
      for (const tag of item.tags) set.add(tag)
    }
    return [...set].sort()
  }, [localItems])

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    return localItems.filter((item) => {
      if (tagFilter && !item.tags.includes(tagFilter)) return false
      if (!q) return true
      return item.title.toLowerCase().includes(q) || item.summary?.toLowerCase().includes(q)
    })
  }, [localItems, tagFilter, query])

  function updateItem(id: string, patch: Partial<ArticleItem>) {
    setLocalItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  async function handleRemove(id: string) {
    setPendingId(id)
    setError(null)
    setLocalItems((prev) => prev.filter((item) => item.id !== id))
    const result = await clearArticleState(id)
    setPendingId(null)
    if (result.error) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Search saved articles…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 min-w-[16rem] border border-border rounded px-3 py-2 text-sm bg-background"
        />
        <span className="text-xs text-muted shrink-0">
          {visibleItems.length} of {localItems.length}
        </span>
      </div>

      {allTags.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setTagFilter(null)}
            className={
              tagFilter === null
                ? 'shrink-0 rounded-full bg-accent text-accent-foreground px-2.5 py-1 transition-colors'
                : 'shrink-0 rounded-full border border-border text-muted px-2.5 py-1 hover:bg-foreground/5 transition-colors'
            }
          >
            All
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setTagFilter(tag)}
              className={
                tagFilter === tag
                  ? 'shrink-0 rounded-full bg-accent text-accent-foreground px-2.5 py-1 transition-colors'
                  : 'shrink-0 rounded-full border border-border text-muted px-2.5 py-1 hover:bg-foreground/5 transition-colors'
              }
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {localItems.length === 0 ? (
        <p className="text-sm text-muted">No saved articles yet.</p>
      ) : visibleItems.length === 0 ? (
        <p className="text-sm text-muted">No saved articles match.</p>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-lg">
          {visibleItems.map((item) => (
            <li key={item.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs text-muted mb-0.5">
                    {item.feed_title && <span className="font-medium">{item.feed_title}</span>}
                    {formatDate(item.published_at) && <span>{formatDate(item.published_at)}</span>}
                  </div>
                  {item.link ? (
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium hover:underline"
                    >
                      {item.title}
                    </a>
                  ) : (
                    <p className="text-sm font-medium">{item.title}</p>
                  )}
                  {item.summary && (
                    <p className="text-sm text-muted mt-0.5 line-clamp-2">{item.summary}</p>
                  )}
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
                </div>
                <button
                  type="button"
                  disabled={pendingId === item.id}
                  onClick={() => handleRemove(item.id)}
                  className="shrink-0 text-sm text-red-600 hover:text-red-800 transition-colors disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
