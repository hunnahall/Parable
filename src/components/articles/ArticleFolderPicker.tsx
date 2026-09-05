'use client'

import { useEffect, useRef, useState } from 'react'
import { FolderPlus, Check } from 'lucide-react'
import type { FolderOption } from './ArticleCard'

// A checkbox popover rather than a <select>, because an article can now
// live in several folders at once — a native select can express "one of
// these" but not "these three", and its multiple attribute is unusable at
// this size.
export default function ArticleFolderPicker({
  selectedIds,
  folders,
  onChange,
  addingFolder,
  setAddingFolder,
  newFolderName,
  setNewFolderName,
  onCreateFolder,
  disabled = false,
}: {
  selectedIds: string[]
  folders: FolderOption[]
  onChange: (folderIds: string[]) => void
  addingFolder: boolean
  setAddingFolder: (v: boolean) => void
  newFolderName: string
  setNewFolderName: (v: string) => void
  onCreateFolder: () => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDocPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const selected = new Set(selectedIds)
  const label =
    selectedIds.length === 0
      ? 'Save'
      : selectedIds.length === 1
        ? (folders.find((f) => f.id === selectedIds[0])?.label ?? '1 folder')
        : `${selectedIds.length} folders`

  function toggle(id: string) {
    onChange(selected.has(id) ? selectedIds.filter((f) => f !== id) : [...selectedIds, id])
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className={
          'inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-sm transition-colors disabled:opacity-50 ' +
          (selectedIds.length > 0
            ? 'text-accent hover:opacity-80'
            : 'text-muted hover:text-foreground')
        }
      >
        <FolderPlus size={13} strokeWidth={1.75} aria-hidden="true" />
        {label}
      </button>

      {open && (
        <div className="card-modal absolute left-0 top-full z-30 mt-1 w-52 p-1">
          {folders.length === 0 && !addingFolder && (
            <p className="px-2 py-1.5 text-sm text-muted">No folders yet.</p>
          )}
          <ul className="max-h-56 overflow-y-auto">
            {folders.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => toggle(f.id)}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-base transition-colors hover:bg-foreground/5"
                >
                  <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                    {selected.has(f.id) && (
                      <Check size={13} strokeWidth={2.25} aria-hidden="true" className="text-accent" />
                    )}
                  </span>
                  <span className="truncate">{f.label}</span>
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-1 border-t border-border-subtle pt-1">
            {addingFolder ? (
              <input
                type="text"
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onBlur={onCreateFolder}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') {
                    setNewFolderName('')
                    setAddingFolder(false)
                  }
                }}
                placeholder="New folder…"
                aria-label="New folder name"
                className="w-full rounded-sm border border-border bg-background px-2 py-1 text-base"
              />
            ) : (
              <button
                type="button"
                onClick={() => setAddingFolder(true)}
                className="w-full rounded-sm px-2 py-1.5 text-left text-base text-muted transition-colors hover:bg-foreground/5 hover:text-foreground"
              >
                + New folder
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
