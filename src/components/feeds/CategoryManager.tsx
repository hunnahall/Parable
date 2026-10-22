'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Pencil, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import {
  addCategory,
  removeCategory,
  renameCategory,
  reorderCategories,
} from '@/lib/categories/actions'
import type { CategoryRow } from '@/lib/categories/data'

// Categories group feeds, and the Inbox lists them in this order.
export default function CategoryManager({ categories }: { categories: CategoryRow[] }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Optimistic local copy, as in FeedManager: router.refresh() re-runs the
  // whole page's data, so reordering shouldn't wait on it.
  const [local, setLocal] = useState(categories)
  const [syncedFrom, setSyncedFrom] = useState(categories)
  if (categories !== syncedFrom) {
    setSyncedFrom(categories)
    setLocal(categories)
  }

  async function run(action: () => Promise<{ error: string | null }>): Promise<boolean> {
    setPending(true)
    setError(null)
    const result = await action()
    setPending(false)
    if (result.error) {
      setError(result.error)
      return false
    }
    router.refresh()
    return true
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (await run(() => addCategory(name))) setName('')
  }

  async function handleSaveEdit(id: string) {
    if (await run(() => renameCategory(id, editName))) setEditingId(null)
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const next = [...local]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setLocal(next)
    const ok = await run(() => reorderCategories(next.map((c) => c.id)))
    if (!ok) setLocal(categories)
  }

  async function handleRemove(id: string) {
    const ok = await run(() => removeCategory(id))
    if (ok) setLocal((prev) => prev.filter((c) => c.id !== id))
  }

  return (
    <section className="cw-panel">
      <div className="cw-panel__head">
        <h2 className="cw-panel__title">Categories</h2>
      </div>
      <form
        onSubmit={handleAdd}
        className="cw-panel__body grid gap-3 border-b border-border min-[640px]:grid-cols-[1fr_auto] min-[640px]:items-end"
      >
        <Field label="New category" htmlFor="new-category-name">
          <Input
            id="new-category-name"
            placeholder="Tunisia, Tech, Domestic Politics"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Button type="submit" variant="primary" disabled={pending}>
          Add category
        </Button>
      </form>
      {error && <p className="cw-error px-4 pt-3">{error}</p>}
      {local.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted">No categories yet. The Inbox lists them in the order set here.</p>
      ) : (
        <ul className="divide-y divide-border">
          {local.map((category, index) =>
            editingId === category.id ? (
              <li
                key={category.id}
                className="grid gap-3 px-4 py-3 min-[640px]:grid-cols-[1fr_auto_auto] min-[640px]:items-end"
              >
                <Field label="Name" htmlFor={`edit-category-name-${category.id}`}>
                  <Input
                    id={`edit-category-name-${category.id}`}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </Field>
                <Button variant="primary" disabled={pending} onClick={() => handleSaveEdit(category.id)}>
                  Save category
                </Button>
                <Button variant="ghost" onClick={() => setEditingId(null)}>
                  Cancel
                </Button>
              </li>
            ) : (
              <li
                key={category.id}
                className="flex items-center justify-between gap-2 px-4 py-2 text-sm hover:bg-fill-hover"
              >
                <span>{category.name}</span>
                <span className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon
                    disabled={pending || index === 0}
                    aria-label={`Move ${category.name} up`}
                    title="Move up"
                    onClick={() => handleMove(index, -1)}
                  >
                    <ArrowUp strokeWidth={1.5} aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon
                    disabled={pending || index === local.length - 1}
                    aria-label={`Move ${category.name} down`}
                    title="Move down"
                    onClick={() => handleMove(index, 1)}
                  >
                    <ArrowDown strokeWidth={1.5} aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon
                    aria-label={`Rename category ${category.name}`}
                    title="Rename category"
                    onClick={() => {
                      setEditingId(category.id)
                      setEditName(category.name)
                      setError(null)
                    }}
                  >
                    <Pencil strokeWidth={1.5} aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon
                    disabled={pending}
                    aria-label={`Delete category ${category.name}`}
                    title="Delete category. Its feeds stay, uncategorized."
                    className="hover:text-danger!"
                    onClick={() => handleRemove(category.id)}
                  >
                    <X strokeWidth={1.5} aria-hidden="true" />
                  </Button>
                </span>
              </li>
            )
          )}
        </ul>
      )}
    </section>
  )
}
