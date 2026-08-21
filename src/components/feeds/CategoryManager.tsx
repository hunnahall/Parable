'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { addCategory, removeCategory } from '@/lib/categories/actions'

export default function CategoryManager({ categories }: { categories: string[] }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Optimistic local copy — see ArticleList.tsx for why gating a visible
  // add/remove on router.refresh() (which re-runs this whole page's server
  // data) made this feel multi-second slow.
  const [localCategories, setLocalCategories] = useState(categories)
  const [syncedFrom, setSyncedFrom] = useState(categories)
  if (categories !== syncedFrom) {
    setSyncedFrom(categories)
    setLocalCategories(categories)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    const trimmed = name.trim()
    const result = await addCategory(name)
    setPending(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setLocalCategories((prev) => [...prev, trimmed])
    setName('')
    router.refresh()
  }

  async function handleRemove(category: string) {
    setPending(true)
    setError(null)
    setLocalCategories((prev) => prev.filter((c) => c !== category))
    const result = await removeCategory(category)
    setPending(false)
    if (result.error) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  return (
    <div className="border border-border p-4 space-y-3">
      <h2 className="text-sm font-medium">Manage categories</h2>
      <form onSubmit={handleAdd} className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="New category name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 min-w-[12rem] border border-border px-3 py-2 text-sm bg-background"
        />
        <button
          type="submit"
          disabled={pending}
          className="bg-foreground text-background px-4 py-2 text-sm transition-colors hover:opacity-90 disabled:opacity-50"
        >
          Add category
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {localCategories.length === 0 ? (
        <p className="text-sm text-muted">No categories yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {localCategories.map((category) => (
            <li
              key={category}
              className="flex items-center gap-2 text-xs bg-foreground/5 px-3 py-1"
            >
              {category}
              <button
                type="button"
                disabled={pending}
                onClick={() => handleRemove(category)}
                className="text-muted hover:text-red-600 transition-colors disabled:opacity-50"
                aria-label={`Delete category ${category}`}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
