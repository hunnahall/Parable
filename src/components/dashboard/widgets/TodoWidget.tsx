'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { TaskRow } from '@/lib/tasks/data'
import { addTask, toggleTask, removeTask } from '@/lib/tasks/actions'

export default function TodoWidget({ items }: { items: TaskRow[] }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Optimistic local copy so checking a box or deleting a task feels
  // instant. router.refresh() re-runs the *whole* page's server data —
  // every widget, not just this one — so waiting on it before updating
  // the UI made toggling feel laggy whenever anything else on the
  // dashboard was slow to fetch. See DashboardGrid.tsx for the same
  // "sync local state from a changed prop during render" pattern.
  const [localItems, setLocalItems] = useState(items)
  const [syncedFrom, setSyncedFrom] = useState(items)
  if (items !== syncedFrom) {
    setSyncedFrom(items)
    setLocalItems(items)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    const result = await addTask(title)
    setPending(false)
    if (result.error !== null) {
      setError(result.error)
      return
    }
    setLocalItems((prev) => [...prev, result.task])
    setTitle('')
    router.refresh()
  }

  async function handleToggle(id: string, done: boolean) {
    setLocalItems((prev) => prev.map((task) => (task.id === id ? { ...task, done } : task)))
    await toggleTask(id, done)
    router.refresh()
  }

  async function handleRemove(id: string) {
    setLocalItems((prev) => prev.filter((task) => task.id !== id))
    await removeTask(id)
    router.refresh()
  }

  return (
    <div className="space-y-2">
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          type="text"
          placeholder="Add a task…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1 min-w-0 border border-border rounded px-2 py-1 text-sm bg-background"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-full bg-accent text-accent-foreground px-3 py-1 text-sm transition-colors hover:bg-accent/90 disabled:opacity-50"
        >
          Add
        </button>
      </form>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {localItems.length === 0 ? (
        <p className="text-sm text-muted">No tasks yet.</p>
      ) : (
        <ul className="space-y-1">
          {localItems.map((task) => (
            <li key={task.id} className="group flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={task.done}
                onChange={() => handleToggle(task.id, !task.done)}
                className="shrink-0"
                aria-label={`Mark "${task.title}" as ${task.done ? 'not done' : 'done'}`}
              />
              <span className={task.done ? 'flex-1 min-w-0 truncate line-through text-muted' : 'flex-1 min-w-0 truncate'}>
                {task.title}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(task.id)}
                className="shrink-0 text-muted hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100 text-xs"
                aria-label={`Delete task "${task.title}"`}
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
