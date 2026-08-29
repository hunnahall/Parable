'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { renameTagGlobally, deleteTagGlobally } from '@/lib/tags/actions'
import type { TagCount } from '@/lib/tags/data'

export default function TagManager({ tags }: { tags: TagCount[] }) {
  const router = useRouter()
  const [editingTag, setEditingTag] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function startEdit(tag: string) {
    setEditingTag(tag)
    setEditValue(tag)
    setError(null)
  }

  async function handleRename(oldTag: string) {
    setPending(true)
    setError(null)
    const result = await renameTagGlobally(oldTag, editValue)
    setPending(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setEditingTag(null)
    router.refresh()
  }

  async function handleDelete(tag: string) {
    setPending(true)
    setError(null)
    const result = await deleteTagGlobally(tag)
    setPending(false)
    if (result.error) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  return (
    <div className="card-elevated p-4 space-y-3">
      <h2 className="text-base font-bold">Manage tags</h2>
      {error && <p className="text-sm text-danger">{error}</p>}
      {tags.length === 0 ? (
        <p className="text-sm text-muted">No tags yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {tags.map(({ tag, count }) =>
            editingTag === tag ? (
              <li key={tag} className="py-2 flex items-center gap-2">
                <input
                  type="text"
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="flex-1 border border-border px-2 py-1 text-sm bg-background"
                />
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => handleRename(tag)}
                  className="bg-foreground text-background px-3 py-1.5 text-sm transition-colors hover:opacity-90 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditingTag(null)}
                  className="text-sm text-muted hover:text-accent transition-colors"
                >
                  Cancel
                </button>
              </li>
            ) : (
              <li key={tag} className="py-2 flex items-center justify-between gap-2 text-sm">
                <span>
                  {tag} <span className="text-xs text-muted">({count})</span>
                </span>
                <span className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => startEdit(tag)}
                    className="text-xs text-muted hover:text-accent transition-colors"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleDelete(tag)}
                    className="text-muted hover:text-danger transition-colors disabled:opacity-50"
                    aria-label={`Delete tag ${tag}`}
                  >
                    <X size={12} strokeWidth={1.75} />
                  </button>
                </span>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  )
}
