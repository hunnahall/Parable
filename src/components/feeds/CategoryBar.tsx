'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Pencil, Plus, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { addCategory, removeCategory, renameCategory, reorderCategories } from '@/lib/categories/actions'
import type { CategoryRow } from '@/lib/categories/data'

// The filter value for feeds with no category.
export const UNCATEGORIZED = 'uncategorized'
const NO_CATEGORY = 'No category'

type Mode = { kind: 'idle' } | { kind: 'adding' } | { kind: 'renaming'; id: string } | { kind: 'deleting'; id: string }

// The "Your feeds" category filter, which is also where categories are
// managed (2026-10-22, replacing the Categories panel): New category adds
// one, and with a category selected, the arrows move it earlier or later
// (the order sets the Inbox's order), and Rename and Delete act on it.
// Deleting keeps its feeds, which become uncategorized.
export default function CategoryBar({
  categories: serverCategories,
  value,
  onChange,
}: {
  categories: CategoryRow[]
  value: string
  onChange: (value: string) => void
}) {
  const router = useRouter()
  // Optimistic order, so a move shows at once rather than after the
  // page's data reloads.
  const [categories, setCategories] = useState(serverCategories)
  const [syncedFrom, setSyncedFrom] = useState(serverCategories)
  if (serverCategories !== syncedFrom) {
    setSyncedFrom(serverCategories)
    setCategories(serverCategories)
  }
  const [mode, setMode] = useState<Mode>({ kind: 'idle' })
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedIndex = categories.findIndex((c) => c.id === value)
  const selected = selectedIndex >= 0 ? categories[selectedIndex] : undefined

  async function move(direction: -1 | 1) {
    const target = selectedIndex + direction
    if (selectedIndex < 0 || target < 0 || target >= categories.length) return
    const next = [...categories]
    ;[next[selectedIndex], next[target]] = [next[target], next[selectedIndex]]
    setCategories(next)
    setPending(true)
    setError(null)
    const result = await reorderCategories(next.map((c) => c.id))
    setPending(false)
    if (result.error) {
      setCategories(serverCategories)
      setError(result.error)
      return
    }
    router.refresh()
  }

  function start(next: Mode, initialName = '') {
    setMode(next)
    setName(initialName)
    setError(null)
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
    setMode({ kind: 'idle' })
    router.refresh()
    return true
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (mode.kind === 'adding') {
      let newId: string | null = null
      const ok = await run(async () => {
        const result = await addCategory(name)
        newId = result.id
        return result
      })
      // Show the new, empty category so feeds can be moved into it.
      if (ok && newId) onChange(newId)
    } else if (mode.kind === 'renaming') {
      const id = mode.id
      await run(() => renameCategory(id, name))
    }
  }

  async function confirmDelete(id: string) {
    if (await run(() => removeCategory(id))) onChange('all')
  }

  if (mode.kind === 'adding' || mode.kind === 'renaming') {
    return (
      <div className="space-y-1">
        <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
          <Input
            autoFocus
            required
            aria-label={mode.kind === 'adding' ? 'New category name' : 'Category name'}
            placeholder={mode.kind === 'adding' ? 'New category' : undefined}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') start({ kind: 'idle' })
            }}
            className="w-48"
          />
          <Button type="submit" variant="primary" size="sm" disabled={pending}>
            {mode.kind === 'adding' ? 'Add category' : 'Rename'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => start({ kind: 'idle' })}>
            Cancel
          </Button>
        </form>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    )
  }

  if (mode.kind === 'deleting' && selected) {
    return (
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>
            Delete {selected.name}? Its feeds stay, under {NO_CATEGORY}.
          </span>
          <Button variant="danger-solid" size="sm" disabled={pending} onClick={() => confirmDelete(selected.id)}>
            Delete category
          </Button>
          <Button variant="ghost" size="sm" onClick={() => start({ kind: 'idle' })}>
            Cancel
          </Button>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    )
  }

  return (
    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
      <div className="min-w-0 max-w-full overflow-x-auto">
        <div className="cw-seg" role="group" aria-label="Show feeds in">
          {[
            { id: 'all', label: 'All' },
            ...categories.map((c) => ({ id: c.id, label: c.name })),
            { id: UNCATEGORIZED, label: NO_CATEGORY },
          ].map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={value === option.id}
              onClick={() => onChange(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {selected && (
        <>
          <Button
            variant="ghost"
            size="sm"
            icon
            aria-label={`Move ${selected.name} earlier`}
            title={`Move ${selected.name} earlier`}
            disabled={pending || selectedIndex === 0}
            onClick={() => void move(-1)}
          >
            <ArrowLeft strokeWidth={1.5} aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon
            aria-label={`Move ${selected.name} later`}
            title={`Move ${selected.name} later`}
            disabled={pending || selectedIndex === categories.length - 1}
            onClick={() => void move(1)}
          >
            <ArrowRight strokeWidth={1.5} aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon
            aria-label={`Rename ${selected.name}`}
            title={`Rename ${selected.name}`}
            onClick={() => start({ kind: 'renaming', id: selected.id }, selected.name)}
          >
            <Pencil strokeWidth={1.5} aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon
            aria-label={`Delete ${selected.name}`}
            title={`Delete ${selected.name}`}
            onClick={() => start({ kind: 'deleting', id: selected.id })}
            className="hover:text-danger!"
          >
            <X strokeWidth={1.5} aria-hidden="true" />
          </Button>
        </>
      )}
      <Button variant="ghost" size="sm" onClick={() => start({ kind: 'adding' })}>
        <Plus strokeWidth={1.5} aria-hidden="true" />
        New category
      </Button>
      {error && <p className="w-full text-sm text-danger">{error}</p>}
    </div>
  )
}
