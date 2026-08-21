'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LineChart, Line, ResponsiveContainer, YAxis, XAxis, Tooltip } from 'recharts'
import {
  addIndicator,
  updateIndicator,
  removeIndicator,
  runFetchIndicatorsNow,
  fetchComparisonData,
} from '@/lib/indicators/actions'
import type { IndicatorRow, ComparisonSeries } from '@/lib/indicators/data'
import type { FetchIndicatorsSummary } from '@/lib/indicators/fetch'
import PointTooltip from '@/components/charts/PointTooltip'
import OutlierDot from '@/components/charts/OutlierDot'
import CompareChart from './CompareChart'

function formatDate(dateString: string | null): string {
  if (!dateString) return 'no readings yet'
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return 'no readings yet'
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function Sparkline({
  readings,
}: {
  readings: { date: string; value: number; notable: boolean }[]
}) {
  if (readings.length < 2) return null
  return (
    <div className="h-8 w-24">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={readings}>
          <YAxis domain={['dataMin', 'dataMax']} hide />
          <XAxis dataKey="date" hide />
          <Tooltip content={<PointTooltip />} />
          <Line
            type="monotone"
            dataKey="value"
            stroke="currentColor"
            className="text-muted"
            strokeWidth={1.5}
            dot={<OutlierDot />}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function IndicatorManager({ indicators }: { indicators: IndicatorRow[] }) {
  const router = useRouter()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  // Optimistic local copy — see ArticleList.tsx for why gating a visible
  // add/edit/remove on router.refresh() (which re-runs this whole page's
  // server data) made this feel multi-second slow.
  const [localIndicators, setLocalIndicators] = useState(indicators)
  const [syncedFrom, setSyncedFrom] = useState(indicators)
  if (indicators !== syncedFrom) {
    setSyncedFrom(indicators)
    setLocalIndicators(indicators)
  }

  const [newSeriesCode, setNewSeriesCode] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')

  const [editDisplayName, setEditDisplayName] = useState('')

  const [fetching, setFetching] = useState(false)
  const [fetchSummary, setFetchSummary] = useState<FetchIndicatorsSummary | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [comparing, setComparing] = useState(false)
  const [compareSeries, setCompareSeries] = useState<ComparisonSeries[] | null>(null)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    const result = await addIndicator({
      series_code: newSeriesCode,
      display_name: newDisplayName,
    })
    setPending(false)
    if (result.error !== null) {
      setError(result.error)
      return
    }
    setLocalIndicators((prev) => [...prev, result.indicator])
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
    const display_name = editDisplayName.trim()
    setLocalIndicators((prev) =>
      prev.map((indicator) => (indicator.id === id ? { ...indicator, display_name } : indicator))
    )
    setEditingId(null)
    const result = await updateIndicator(id, { display_name: editDisplayName })
    setPending(false)
    if (result.error) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  async function handleRemove(id: string) {
    setPending(true)
    setError(null)
    setLocalIndicators((prev) => prev.filter((indicator) => indicator.id !== id))
    const result = await removeIndicator(id)
    setPending(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    router.refresh()
  }

  async function handleRunFetch() {
    setFetching(true)
    setFetchError(null)
    setFetchSummary(null)
    const result = await runFetchIndicatorsNow()
    setFetching(false)
    if (result.error) {
      setFetchError(result.error)
      return
    }
    setFetchSummary(result.summary)
    router.refresh()
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleCompare() {
    setComparing(true)
    const result = await fetchComparisonData([...selectedIds])
    setComparing(false)
    setCompareSeries(result)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-6 border-b border-border">
        <div>
          <h2 className="text-sm font-medium">Fetch latest readings now</h2>
          <p className="text-xs text-muted mt-0.5">
            Pulls new readings for every indicator instead of waiting for the cron job.
          </p>
          {fetchSummary && (
            <div className="text-xs text-muted mt-1">
              <p>
                Processed {fetchSummary.indicatorsProcessed} indicator
                {fetchSummary.indicatorsProcessed === 1 ? '' : 's'}, upserted{' '}
                {fetchSummary.readingsUpserted} reading
                {fetchSummary.readingsUpserted === 1 ? '' : 's'}.
              </p>
              {fetchSummary.indicatorsFailed.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {fetchSummary.indicatorsFailed.map((failure) => (
                    <li key={failure.indicatorId} className="text-red-600">
                      {failure.seriesCode}: {failure.error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {fetchError && <p className="text-xs text-red-600 mt-1">{fetchError}</p>}
        </div>
        <button
          type="button"
          onClick={handleRunFetch}
          disabled={fetching}
          className="border border-border px-4 py-2 text-sm hover:bg-foreground/5 transition-colors disabled:opacity-50 shrink-0"
        >
          {fetching ? 'Running…' : 'Fetch now'}
        </button>
      </div>

      <form onSubmit={handleAdd} className="border border-border p-4 space-y-3">
        <h2 className="text-sm font-medium">Add an indicator (FRED)</h2>
        <p className="text-xs text-muted">
          Only FRED is supported right now — find series codes at fred.stlouisfed.org.
        </p>
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Series code (e.g. UNRATE)"
            required
            value={newSeriesCode}
            onChange={(e) => setNewSeriesCode(e.target.value)}
            className="flex-1 min-w-[12rem] border border-border px-3 py-2 text-sm bg-background"
          />
          <input
            type="text"
            placeholder="Display name (optional)"
            value={newDisplayName}
            onChange={(e) => setNewDisplayName(e.target.value)}
            className="flex-1 min-w-[12rem] border border-border px-3 py-2 text-sm bg-background"
          />
          <button
            type="submit"
            disabled={pending}
            className="bg-foreground text-background px-4 py-2 text-sm transition-colors hover:opacity-90 disabled:opacity-50"
          >
            Add indicator
          </button>
        </div>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {selectedIds.size > 0 && (
        <div className="border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm">
              {selectedIds.size} indicator{selectedIds.size === 1 ? '' : 's'} selected
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedIds(new Set())
                  setCompareSeries(null)
                }}
                className="text-sm text-muted hover:text-accent transition-colors"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleCompare}
                disabled={selectedIds.size < 2 || comparing}
                className="bg-foreground text-background px-4 py-2 text-sm transition-colors hover:opacity-90 disabled:opacity-50"
              >
                {comparing ? 'Comparing…' : 'Compare selected'}
              </button>
            </div>
          </div>
          {selectedIds.size < 2 && (
            <p className="text-xs text-muted">Pick at least 2 indicators to compare.</p>
          )}
          {compareSeries && (
            <>
              <p className="text-xs text-muted">
                Normalized to % change from each series&apos; earliest fetched reading.
              </p>
              <CompareChart series={compareSeries} />
            </>
          )}
        </div>
      )}

      {localIndicators.length === 0 ? (
        <p className="text-sm text-muted">No indicators yet.</p>
      ) : (
        <ul className="divide-y divide-border border border-border">
          {localIndicators.map((indicator) => (
            <li key={indicator.id} className="p-4">
              {editingId === indicator.id ? (
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="text"
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    className="flex-1 min-w-[12rem] border border-border px-3 py-1.5 text-sm bg-background"
                  />
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleSaveEdit(indicator.id)}
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
                </div>
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(indicator.id)}
                      onChange={() => toggleSelected(indicator.id)}
                      className="shrink-0"
                      aria-label={`Select ${indicator.display_name ?? indicator.series_code} for comparison`}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {indicator.display_name ?? indicator.series_code}
                        </span>
                        <span className="text-xs bg-foreground/5 text-muted px-2 py-0.5">
                          {indicator.source} · {indicator.series_code}
                        </span>
                      </div>
                      {indicator.description && (
                        <p className="text-xs text-muted mt-0.5">{indicator.description}</p>
                      )}
                      <p className="text-xs text-muted mt-0.5">
                        Latest reading: {formatDate(indicator.latest_reading_date)}
                      </p>
                      {indicator.source === 'FRED' && (
                        <a
                          href={`https://fred.stlouisfed.org/series/${indicator.series_code}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-muted hover:underline"
                        >
                          Source: FRED®, Federal Reserve Bank of St. Louis
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <Sparkline readings={indicator.recent_readings} />
                    <button
                      type="button"
                      onClick={() => startEdit(indicator)}
                      className="text-sm text-muted hover:text-accent transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => handleRemove(indicator.id)}
                      className="text-sm text-red-600 hover:text-red-800 transition-colors disabled:opacity-50"
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
