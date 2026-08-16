'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { addCategory, removeCategory } from '@/lib/categories/actions'

export default function CategoryManager({ categories }: { categories: string[] }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    const result = await addCategory(name)
    setPending(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setName('')
    router.refresh()
  }

  async function handleRemove(category: string) {
    setPending(true)
    setError(null)
    const result = await removeCategory(category)
    setPending(false)
    if (result.error) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <h2 className="text-sm font-medium">Manage categories</h2>
      <form onSubmit={handleAdd} className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="New category name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 min-w-[12rem] border border-border rounded px-3 py-2 text-sm bg-background"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-accent text-accent-foreground px-4 py-2 text-sm transition-colors hover:bg-accent/90 disabled:opacity-50"
        >
          Add category
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {categories.length === 0 ? (
        <p className="text-sm text-muted">No categories yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <li
              key={category}
              className="flex items-center gap-2 text-xs rounded-full bg-foreground/5 px-3 py-1"
            >
              {category}
              <button
                type="button"
                disabled={pending}
                onClick={() => handleRemove(category)}
                className="text-muted hover:text-red-600 transition-colors disabled:opacity-50"
                aria-label={`Delete category ${category}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
