'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export interface MultiSelectOption {
  id: string
  label: string
}

// A generic {id, label} checkbox-list popover — serves both the Articles
// page's folder filter and its source filter (no bespoke component per
// filter), replacing what used to be two single-select <select>s.
export default function MultiSelectDropdown({
  label,
  options,
  selectedIds,
  onChange,
  className = '',
}: {
  label: string
  options: MultiSelectOption[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id])
  }

  const buttonLabel = selectedIds.length > 0 ? `${label} (${selectedIds.length})` : label

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 w-full border border-border px-3 py-2 text-sm bg-background text-left truncate"
      >
        <span className="flex-1 truncate">{buttonLabel}</span>
        <ChevronDown size={14} strokeWidth={1.75} className="shrink-0 text-muted" aria-hidden="true" />
      </button>
      {open && (
        <div className="card-modal absolute z-10 mt-1 max-h-64 w-56 overflow-y-auto py-1">
          {options.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted">No options.</p>
          ) : (
            options.map((option) => (
              <label
                key={option.id}
                className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-foreground/5 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(option.id)}
                  onChange={() => toggle(option.id)}
                />
                <span className="truncate">{option.label}</span>
              </label>
            ))
          )}
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full text-left px-3 py-1.5 text-xs text-muted hover:text-foreground border-t border-border-subtle mt-1 pt-1.5"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  )
}
