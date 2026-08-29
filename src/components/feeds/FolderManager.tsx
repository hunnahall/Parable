'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { addFolder, updateFolder, removeFolder } from '@/lib/folders/actions'
import type { FolderRow } from '@/lib/folders/data'

function depthOf(folder: FolderRow, byId: Map<string, FolderRow>): number {
  let depth = 0
  let current = folder
  while (current.parentId) {
    const parent = byId.get(current.parentId)
    if (!parent) break
    depth++
    current = parent
  }
  return depth
}

// Parent-first order so a flat list still reads as a tree (each folder
// appears directly after its parent, children indented beneath) — chosen
// over a real drag-and-drop tree widget per the locked design decision.
function sortedForDisplay(folders: FolderRow[]): { folder: FolderRow; depth: number }[] {
  const byId = new Map(folders.map((f) => [f.id, f]))
  const byParent = new Map<string | null, FolderRow[]>()
  for (const folder of folders) {
    const list = byParent.get(folder.parentId) ?? []
    list.push(folder)
    byParent.set(folder.parentId, list)
  }
  for (const list of byParent.values()) list.sort((a, b) => a.name.localeCompare(b.name))

  const result: { folder: FolderRow; depth: number }[] = []
  function visit(parentId: string | null) {
    for (const folder of byParent.get(parentId) ?? []) {
      result.push({ folder, depth: depthOf(folder, byId) })
      visit(folder.id)
    }
  }
  visit(null)
  return result
}

export default function FolderManager({ folders }: { folders: FolderRow[] }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editParentId, setEditParentId] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [localFolders, setLocalFolders] = useState(folders)
  const [syncedFrom, setSyncedFrom] = useState(folders)
  if (folders !== syncedFrom) {
    setSyncedFrom(folders)
    setLocalFolders(folders)
  }

  const rows = sortedForDisplay(localFolders)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    const result = await addFolder({ name, parentId: parentId || null })
    setPending(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setName('')
    setParentId('')
    router.refresh()
  }

  function startEdit(folder: FolderRow) {
    setEditingId(folder.id)
    setEditName(folder.name)
    setEditParentId(folder.parentId ?? '')
    setError(null)
  }

  async function handleSaveEdit(id: string) {
    setPending(true)
    setError(null)
    const result = await updateFolder(id, { name: editName, parentId: editParentId || null })
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
    const result = await removeFolder(id)
    setPending(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setLocalFolders((prev) => prev.filter((f) => f.id !== id))
    router.refresh()
  }

  return (
    <div className="card-elevated p-4 space-y-3">
      <h2 className="text-base font-bold">Manage folders</h2>
      <form onSubmit={handleAdd} className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="New folder name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 min-w-[12rem] border border-border px-3 py-2 text-sm bg-background"
        />
        <select
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          className="flex-1 min-w-[10rem] border border-border px-3 py-2 text-sm bg-background"
        >
          <option value="">No parent (top level)</option>
          {rows.map(({ folder, depth }) => (
            <option key={folder.id} value={folder.id}>
              {'—'.repeat(depth)} {folder.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="bg-foreground text-background px-4 py-2 text-sm transition-colors hover:opacity-90 disabled:opacity-50"
        >
          Add folder
        </button>
      </form>
      {error && <p className="text-sm text-danger">{error}</p>}
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No folders yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map(({ folder, depth }) =>
            editingId === folder.id ? (
              <li key={folder.id} className="py-2 flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 min-w-[10rem] border border-border px-2 py-1 text-sm bg-background"
                />
                <select
                  value={editParentId}
                  onChange={(e) => setEditParentId(e.target.value)}
                  className="flex-1 min-w-[10rem] border border-border px-2 py-1 text-sm bg-background"
                >
                  <option value="">No parent (top level)</option>
                  {rows
                    .filter(({ folder: f }) => f.id !== folder.id)
                    .map(({ folder: f, depth: d }) => (
                      <option key={f.id} value={f.id}>
                        {'—'.repeat(d)} {f.name}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => handleSaveEdit(folder.id)}
                  className="bg-foreground text-background px-3 py-1.5 text-sm transition-colors hover:opacity-90 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="text-sm text-muted hover:text-accent transition-colors"
                >
                  Cancel
                </button>
              </li>
            ) : (
              <li key={folder.id} className="py-2 flex items-center justify-between gap-2 text-sm">
                <span style={{ paddingLeft: depth * 16 }}>{folder.name}</span>
                <span className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => startEdit(folder)}
                    className="text-xs text-muted hover:text-accent transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleRemove(folder.id)}
                    className="text-muted hover:text-danger transition-colors disabled:opacity-50"
                    aria-label={`Delete folder ${folder.name}`}
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
