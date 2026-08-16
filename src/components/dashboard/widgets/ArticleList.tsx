'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ArticleItem } from '@/lib/dashboard/data'
import { saveArticle, ignoreArticle, clearArticleState } from '@/lib/articles/actions'

function formatDate(dateString: string | null): string | null {
  if (!dateString) return null
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function ArticleList({ items }: { items: ArticleItem[] }) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [errorId, setErrorId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSave(id: string) {
    setPendingId(id)
    setError(null)
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
    <ul className="space-y-3">
      {items.map((item) => (
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
          <div className="flex items-center gap-3 mt-1">
            {item.state === 'saved' ? (
              <button
                type="button"
                disabled={pendingId === item.id}
                onClick={() => handleUnsave(item.id)}
                className="text-xs text-muted hover:text-foreground transition-colors disabled:opacity-50"
              >
                Unsave
              </button>
            ) : (
              <button
                type="button"
                disabled={pendingId === item.id}
                onClick={() => handleSave(item.id)}
                className="text-xs text-muted hover:text-foreground transition-colors disabled:opacity-50"
              >
                Save
              </button>
            )}
            <button
              type="button"
              disabled={pendingId === item.id}
              onClick={() => handleIgnore(item.id)}
              className="text-xs text-muted hover:text-foreground transition-colors disabled:opacity-50"
            >
              Ignore
            </button>
          </div>
          {errorId === item.id && error && (
            <p className="text-xs text-red-600 mt-1">{error}</p>
          )}
        </li>
      ))}
    </ul>
  )
}
