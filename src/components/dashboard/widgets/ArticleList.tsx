'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ArticleItem } from '@/lib/dashboard/data'
import { saveArticle, ignoreArticle, clearArticleState } from '@/lib/articles/actions'
import ArticleNoteEditor from '@/components/articles/ArticleNoteEditor'
import ArticleTagEditor from '@/components/articles/ArticleTagEditor'

function formatDate(dateString: string | null): string | null {
  if (!dateString) return null
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function ArticleList({
  items,
  savedOnly = false,
}: {
  items: ArticleItem[]
  // True for widgets whose underlying query already filters to state ===
  // 'saved' (the "Saved articles" widget) — an unsave/ignore there means
  // the item no longer belongs in this list at all, not just a state
  // change, so it should disappear locally rather than stay with an
  // updated badge.
  savedOnly?: boolean
}) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [errorId, setErrorId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tagFilter, setTagFilter] = useState<string | null>(null)

  // Optimistic local copy so saving/ignoring/tagging an article feels
  // instant. router.refresh() re-runs the *whole* page's server data —
  // every widget, not just this one — so waiting on it before updating
  // the UI made a single tag edit feel multi-second slow. See
  // TodoWidget.tsx for the same "sync local state from a changed prop
  // during render" pattern.
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

  const visibleItems = tagFilter
    ? localItems.filter((item) => item.tags.includes(tagFilter))
    : localItems

  function updateItem(id: string, patch: Partial<ArticleItem>) {
    setLocalItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  function removeItem(id: string) {
    setLocalItems((prev) => prev.filter((item) => item.id !== id))
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
    // An ignored article can never satisfy any of this list's queries
    // (headlines/feed/category exclude it, saved requires state ===
    // 'saved'), so it's always safe to drop locally.
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
    if (savedOnly) {
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

  if (items.length === 0) {
    return <p className="text-sm text-muted">No articles yet.</p>
  }

  return (
    <div>
      {allTags.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs mb-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setTagFilter(null)}
            className={
              tagFilter === null
                ? 'shrink-0 border border-accent text-accent bg-accent/10 px-2.5 py-0.5 transition-colors'
                : 'shrink-0 border border-border text-muted px-2.5 py-0.5 hover:border-accent hover:text-accent transition-colors'
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
                  ? 'shrink-0 border border-accent text-accent bg-accent/10 px-2.5 py-0.5 transition-colors'
                  : 'shrink-0 border border-border text-muted px-2.5 py-0.5 hover:border-accent hover:text-accent transition-colors'
              }
            >
              {tag}
            </button>
          ))}
        </div>
      )}
      <ul className="space-y-3">
        {visibleItems.map((item) => (
          <li key={item.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
            <div className="flex items-center gap-2 text-xs text-muted mb-0.5">
              {item.feed_title && <span className="font-medium">{item.feed_title}</span>}
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
              <button
                type="button"
                disabled={pendingId === item.id}
                onClick={() => handleIgnore(item.id)}
                className="text-xs text-muted hover:text-accent transition-colors disabled:opacity-50"
              >
                Ignore
              </button>
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
            {errorId === item.id && error && (
              <p className="text-xs text-red-600 mt-1">{error}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
