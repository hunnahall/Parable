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
        className="cw-btn cw-btn--secondary w-full justify-between!"
      >
        <span className="flex-1 truncate">{buttonLabel}</span>
        <ChevronDown strokeWidth={1.5} className="shrink-0 text-muted" aria-hidden="true" />
      </button>
      {open && (
        <div className="cw-menu absolute z-30 mt-1 max-h-64 w-56 overflow-y-auto">
          {options.length === 0 ? (
            <p className="px-2 py-2 text-sm text-muted">Nothing to filter by yet</p>
          ) : (
            options.map((option) => (
              <label
                key={option.id}
                className="cw-check cw-menu__item"
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
              className="cw-menu__item mt-1 border-t! border-border! text-muted!"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  )
}
