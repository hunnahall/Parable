'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Pencil, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Input'
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
    <section className="cw-panel">
      <div className="cw-panel__head">
        <h2 className="cw-panel__title">Folders</h2>
      </div>
      <form onSubmit={handleAdd} className="cw-panel__body grid gap-3 border-b border-border min-[640px]:grid-cols-[2fr_1.5fr_auto] min-[640px]:items-end">
        <Field label="New folder" htmlFor="new-folder-name">
          <Input id="new-folder-name" placeholder="Name" required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Inside" htmlFor="new-folder-parent">
          <Select id="new-folder-parent" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">Top level</option>
            {rows.map(({ folder, depth }) => (
              <option key={folder.id} value={folder.id}>
                {'  '.repeat(depth)}
                {folder.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" variant="primary" disabled={pending}>
          Add folder
        </Button>
      </form>
      {error && <p className="cw-error px-4 pt-3">{error}</p>}
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted">No folders yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map(({ folder, depth }) =>
            editingId === folder.id ? (
              <li key={folder.id} className="grid gap-3 px-4 py-3 min-[640px]:grid-cols-[2fr_1.5fr_auto_auto] min-[640px]:items-end">
                <Field label="Name" htmlFor={`edit-folder-${folder.id}`}>
                  <Input id={`edit-folder-${folder.id}`} value={editName} onChange={(e) => setEditName(e.target.value)} />
                </Field>
                <Field label="Inside" htmlFor={`edit-folder-parent-${folder.id}`}>
                  <Select
                    id={`edit-folder-parent-${folder.id}`}
                    value={editParentId}
                    onChange={(e) => setEditParentId(e.target.value)}
                  >
                    <option value="">Top level</option>
                    {rows
                      .filter(({ folder: f }) => f.id !== folder.id)
                      .map(({ folder: f, depth: d }) => (
                        <option key={f.id} value={f.id}>
                          {'  '.repeat(d)}
                          {f.name}
                        </option>
                      ))}
                  </Select>
                </Field>
                <Button variant="primary" disabled={pending} onClick={() => handleSaveEdit(folder.id)}>
                  Save folder
                </Button>
                <Button variant="ghost" onClick={() => setEditingId(null)}>
                  Cancel
                </Button>
              </li>
            ) : (
              <li key={folder.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm hover:bg-fill-hover">
                <span style={{ paddingLeft: depth * 16 }}>
                  <Link href={`/saved?folder=${folder.id}`} className="underline-offset-4 hover:underline">
                    {folder.name}
                  </Link>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="sm" icon aria-label={`Edit folder ${folder.name}`} title="Edit folder" onClick={() => startEdit(folder)}>
                    <Pencil strokeWidth={1.5} aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon
                    disabled={pending}
                    onClick={() => handleRemove(folder.id)}
                    aria-label={`Delete folder ${folder.name}`}
                    title="Delete folder"
                    className="hover:text-danger"
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
