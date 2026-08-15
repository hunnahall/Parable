'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { addFeed, updateFeed, removeFeed } from '@/lib/feeds/actions'
import type { FeedRow } from '@/lib/feeds/data'

const UNCATEGORIZED = 'Uncategorized'

function formatDate(dateString: string | null): string {
  if (!dateString) return 'never'
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return 'never'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function FeedManager({ feeds }: { feeds: FeedRow[] }) {
  const router = useRouter()
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const [newUrl, setNewUrl] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newCategory, setNewCategory] = useState('')

  const [editTitle, setEditTitle] = useState('')
  const [editCategory, setEditCategory] = useState('')

  const categories = useMemo(() => {
    const set = new Set(feeds.map((feed) => feed.category || UNCATEGORIZED))
    return ['all', ...Array.from(set).sort()]
  }, [feeds])

  const visibleFeeds = feeds.filter((feed) => {
    if (categoryFilter === 'all') return true
    return (feed.category || UNCATEGORIZED) === categoryFilter
  })

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    const result = await addFeed({ url: newUrl, title: newTitle, category: newCategory })
    setPending(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setNewUrl('')
    setNewTitle('')
    setNewCategory('')
    router.refresh()
  }

  function startEdit(feed: FeedRow) {
    setEditingId(feed.id)
    setEditTitle(feed.title)
    setEditCategory(feed.category ?? '')
    setError(null)
  }

  async function handleSaveEdit(id: string) {
    setPending(true)
    setError(null)
    const result = await updateFeed(id, { title: editTitle, category: editCategory })
    setPending(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setEditingId(null)
    router.refresh()
  }

  async function handleRemove(id: string) {
    setPending(true)
    setError(null)
    const result = await removeFeed(id)
    setPending(false)
    if (result.error) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleAdd} className="border rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-medium">Add a feed</h2>
        <div className="flex flex-wrap gap-3">
          <input
            type="url"
            placeholder="https://example.com/rss.xml"
            required
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            className="flex-1 min-w-[16rem] border rounded px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Title"
            required
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="flex-1 min-w-[10rem] border rounded px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Category (optional)"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="flex-1 min-w-[10rem] border rounded px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-black text-white px-4 py-2 text-sm disabled:opacity-50"
          >
            Add feed
          </button>
        </div>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-500">Category:</span>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="border rounded px-2 py-1"
        >
          {categories.map((category) => (
            <option key={category} value={category}>
              {category === 'all' ? 'All' : category}
            </option>
          ))}
        </select>
      </div>

      {visibleFeeds.length === 0 ? (
        <p className="text-sm text-gray-500">No feeds yet.</p>
      ) : (
        <ul className="divide-y border rounded-lg">
          {visibleFeeds.map((feed) => (
            <li key={feed.id} className="p-4">
              {editingId === feed.id ? (
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="flex-1 min-w-[10rem] border rounded px-3 py-1.5 text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Category"
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="flex-1 min-w-[10rem] border rounded px-3 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleSaveEdit(feed.id)}
                    className="rounded bg-black text-white px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="text-sm text-gray-500"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{feed.title}</span>
                      <span className="text-xs rounded-full bg-gray-100 text-gray-600 px-2 py-0.5">
                        {feed.category || UNCATEGORIZED}
                      </span>
                    </div>
                    <a
                      href={feed.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-gray-500 hover:underline truncate block"
                    >
                      {feed.url}
                    </a>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Last fetched: {formatDate(feed.last_fetched_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(feed)}
                      className="text-sm text-gray-500 hover:text-gray-800"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => handleRemove(feed.id)}
                      className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
