'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ArticleItem } from '@/lib/dashboard/data'
import {
  saveArticle,
  ignoreArticle,
  clearArticleState,
  setArticleNote,
  setArticleTags,
} from '@/lib/articles/actions'

function formatDate(dateString: string | null): string | null {
  if (!dateString) return null
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function ArticleNote({ itemId, note }: { itemId: string; note: string | null }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(note ?? '')

  async function commit() {
    setEditing(false)
    if (value.trim() === (note ?? '')) return
    await setArticleNote(itemId, value)
    router.refresh()
  }

  if (editing) {
    return (
      <input
        type="text"
        autoFocus
        value={value}
        placeholder="Add a note…"
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setValue(note ?? '')
            setEditing(false)
          }
        }}
        className="w-full border border-border rounded px-1.5 py-0.5 text-xs bg-background mt-1"
      />
    )
  }

  return note ? (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="block text-left text-xs italic text-muted hover:text-foreground transition-colors mt-1"
    >
      {note}
    </button>
  ) : (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="text-xs text-muted hover:text-foreground transition-colors mt-1"
    >
      + Note
    </button>
  )
}

function ArticleTags({ itemId, tags }: { itemId: string; tags: string[] }) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [value, setValue] = useState('')

  async function addTag() {
    const trimmed = value.trim()
    setValue('')
    setAdding(false)
    if (!trimmed || tags.includes(trimmed)) return
    await setArticleTags(itemId, [...tags, trimmed])
    router.refresh()
  }

  async function removeTag(tag: string) {
    await setArticleTags(
      itemId,
      tags.filter((t) => t !== tag)
    )
    router.refresh()
  }

  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 text-xs rounded-full bg-foreground/5 text-muted px-2 py-0.5"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="hover:text-red-600 transition-colors"
            aria-label={`Remove tag ${tag}`}
          >
            ×
          </button>
        </span>
      ))}
      {adding ? (
        <input
          type="text"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={addTag}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              setValue('')
              setAdding(false)
            }
          }}
          placeholder="tag…"
          className="w-16 border border-border rounded-full px-2 py-0.5 text-xs bg-background"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-xs text-muted hover:text-foreground transition-colors"
        >
          + tag
        </button>
      )}
    </div>
  )
}

export default function ArticleList({ items }: { items: ArticleItem[] }) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [errorId, setErrorId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tagFilter, setTagFilter] = useState<string | null>(null)

  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const item of items) {
      for (const tag of item.tags) set.add(tag)
    }
    return [...set].sort()
  }, [items])

  const visibleItems = tagFilter ? items.filter((item) => item.tags.includes(tagFilter)) : items

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
    <div>
      {allTags.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs mb-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setTagFilter(null)}
            className={
              tagFilter === null
                ? 'shrink-0 rounded-full bg-accent text-accent-foreground px-2.5 py-0.5 transition-colors'
                : 'shrink-0 rounded-full border border-border text-muted px-2.5 py-0.5 hover:bg-foreground/5 transition-colors'
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
                  ? 'shrink-0 rounded-full bg-accent text-accent-foreground px-2.5 py-0.5 transition-colors'
                  : 'shrink-0 rounded-full border border-border text-muted px-2.5 py-0.5 hover:bg-foreground/5 transition-colors'
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
            {item.state === 'saved' && (
              <>
                <ArticleNote itemId={item.id} note={item.note} />
                <ArticleTags itemId={item.id} tags={item.tags} />
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
