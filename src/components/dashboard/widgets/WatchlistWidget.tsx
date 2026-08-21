'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { WatchlistEntry } from '@/lib/dashboard/data'
import { updateWidgetConfig } from '@/lib/dashboard/actions'

export default function WatchlistWidget({
  widgetId,
  items,
  selectedIds,
}: {
  widgetId: string
  items: WatchlistEntry[]
  selectedIds: string[]
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draftIds, setDraftIds] = useState<string[]>(selectedIds)

  // Optimistic local copy of which indicators this widget shows — router.
  // refresh() re-runs the whole dashboard's server data, so gating the
  // filtered rows on it made "Save" look like it did nothing for a couple
  // seconds. See ArticleList.tsx for the same reasoning.
  const [localSelectedIds, setLocalSelectedIds] = useState(selectedIds)
  const [syncedFrom, setSyncedFrom] = useState(selectedIds)
  if (selectedIds !== syncedFrom) {
    setSyncedFrom(selectedIds)
    setLocalSelectedIds(selectedIds)
  }

  // Empty selection means "show everything" — including indicators added
  // after this widget was configured, without needing a manual re-edit.
  const visibleItems =
    localSelectedIds.length === 0
      ? items
      : items.filter((entry) => localSelectedIds.includes(entry.id))

  function startEdit() {
    setDraftIds(localSelectedIds.length === 0 ? items.map((entry) => entry.id) : localSelectedIds)
    setEditing(true)
  }

  function toggleDraft(id: string) {
    setDraftIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function handleSave() {
    // Selecting everything is stored the same as an empty filter, so newly
    // added indicators keep showing up automatically.
    const indicatorIds = draftIds.length === items.length ? '' : draftIds.join(',')
    setLocalSelectedIds(draftIds.length === items.length ? [] : draftIds)
    setEditing(false)
    await updateWidgetConfig(widgetId, { indicator_ids: indicatorIds })
    router.refresh()
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted">No indicators yet.</p>
  }

  if (editing) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted">Choose which indicators to show.</p>
        <ul className="space-y-1 max-h-40 overflow-auto">
          {items.map((entry) => (
            <li key={entry.id} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={draftIds.includes(entry.id)}
                onChange={() => toggleDraft(entry.id)}
                id={`watchlist-${widgetId}-${entry.id}`}
              />
              <label htmlFor={`watchlist-${widgetId}-${entry.id}`} className="truncate">
                {entry.display_name ?? entry.series_code}
              </label>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            className="rounded-full bg-accent text-accent-foreground px-3 py-1 text-xs transition-colors hover:bg-accent/90"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-xs text-muted hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={startEdit}
          className="text-xs text-muted hover:text-foreground transition-colors mb-1"
        >
          Edit
        </button>
      </div>
      {visibleItems.length === 0 ? (
        <p className="text-sm text-muted">No indicators selected.</p>
      ) : (
        <table className="w-full text-xs table-fixed">
          <colgroup>
            <col className="w-[56%]" />
            <col className="w-[22%]" />
            <col className="w-[22%]" />
          </colgroup>
          <tbody className="divide-y divide-border">
            {visibleItems.map((entry) => {
              const delta =
                entry.latest_value !== null && entry.previous_value !== null
                  ? entry.latest_value - entry.previous_value
                  : null
              return (
                <tr key={entry.id}>
                  <td className="py-1.5 pr-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-medium truncate">
                        {entry.display_name ?? entry.series_code}
                      </span>
                      {entry.notable && (
                        <span
                          className="shrink-0 text-amber-600"
                          title="Notable move — a statistical outlier relative to recent history"
                        >
                          ●
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums whitespace-nowrap">
                    {entry.latest_value !== null ? entry.latest_value.toLocaleString() : '—'}
                  </td>
                  <td className="py-1.5 text-right tabular-nums whitespace-nowrap">
                    {delta !== null ? (
                      <span className={delta >= 0 ? 'text-green-700' : 'text-red-700'}>
                        {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
