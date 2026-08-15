'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { addIndicator, updateIndicator, removeIndicator } from '@/lib/indicators/actions'
import type { IndicatorRow } from '@/lib/indicators/data'

function formatDate(dateString: string | null): string {
  if (!dateString) return 'no readings yet'
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return 'no readings yet'
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function IndicatorManager({ indicators }: { indicators: IndicatorRow[] }) {
  const router = useRouter()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const [newSeriesCode, setNewSeriesCode] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')

  const [editDisplayName, setEditDisplayName] = useState('')

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    const result = await addIndicator({
      series_code: newSeriesCode,
      display_name: newDisplayName,
    })
    setPending(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setNewSeriesCode('')
    setNewDisplayName('')
    router.refresh()
  }

  function startEdit(indicator: IndicatorRow) {
    setEditingId(indicator.id)
    setEditDisplayName(indicator.display_name ?? '')
    setError(null)
  }

  async function handleSaveEdit(id: string) {
    setPending(true)
    setError(null)
    const result = await updateIndicator(id, { display_name: editDisplayName })
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
    const result = await removeIndicator(id)
    setPending(false)
    if (result.error) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleAdd} className="border rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-medium">Add an indicator (FRED)</h2>
        <p className="text-xs text-gray-500">
          Only FRED is supported right now — find series codes at fred.stlouisfed.org.
        </p>
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Series code (e.g. UNRATE)"
            required
            value={newSeriesCode}
            onChange={(e) => setNewSeriesCode(e.target.value)}
            className="flex-1 min-w-[12rem] border rounded px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Display name (e.g. Unemployment Rate)"
            required
            value={newDisplayName}
            onChange={(e) => setNewDisplayName(e.target.value)}
            className="flex-1 min-w-[12rem] border rounded px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-black text-white px-4 py-2 text-sm disabled:opacity-50"
          >
            Add indicator
          </button>
        </div>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {indicators.length === 0 ? (
        <p className="text-sm text-gray-500">No indicators yet.</p>
      ) : (
        <ul className="divide-y border rounded-lg">
          {indicators.map((indicator) => (
            <li key={indicator.id} className="p-4">
              {editingId === indicator.id ? (
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="text"
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    className="flex-1 min-w-[12rem] border rounded px-3 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleSaveEdit(indicator.id)}
                    className="rounded bg-black text-white px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="text-sm text-gray-500"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {indicator.display_name ?? indicator.series_code}
                      </span>
                      <span className="text-xs rounded-full bg-gray-100 text-gray-600 px-2 py-0.5">
                        {indicator.source} · {indicator.series_code}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Latest reading: {formatDate(indicator.latest_reading_date)}
                    </p>
                    {indicator.source === 'FRED' && (
                      <a
                        href={`https://fred.stlouisfed.org/series/${indicator.series_code}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-gray-400 hover:underline"
                      >
                        Source: FRED®, Federal Reserve Bank of St. Louis
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(indicator)}
                      className="text-sm text-gray-500 hover:text-gray-800"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => handleRemove(indicator.id)}
                      className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
