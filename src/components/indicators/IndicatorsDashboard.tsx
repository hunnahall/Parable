'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ReactGridLayout, WidthProvider, type Layout } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import type { IndicatorDashboardWidget as IndicatorDashboardWidgetData, IndicatorDashboardOption } from '@/lib/indicators/dashboard'
import { addIndicatorToDashboard, removeFromDashboard, reorderDashboard } from '@/lib/indicators/dashboard-actions'
import IndicatorDashboardWidget from './IndicatorDashboardWidget'

const GridLayout = WidthProvider(ReactGridLayout)

// One universal fixed size per plan §6 — 6 cols (2 per row on a 12-col
// grid) × 8 rows (320px at rowHeight 40) is large enough for the chart to
// read comfortably without needing per-widget size choices.
const WIDGET_W = 6
const WIDGET_H = 8

export default function IndicatorsDashboard({
  initialWidgets,
  availableToAdd,
}: {
  initialWidgets: IndicatorDashboardWidgetData[]
  availableToAdd: IndicatorDashboardOption[]
}) {
  const [widgets, setWidgets] = useState(initialWidgets)
  // See DashboardGrid.tsx for why this sync is needed: useState only seeds
  // from initialWidgets on mount, so a fresh prop from router.refresh()
  // (e.g. after adding/removing an indicator) would otherwise sit unused
  // until a full remount — this adjusts state during render instead.
  const [syncedFrom, setSyncedFrom] = useState(initialWidgets)
  if (initialWidgets !== syncedFrom) {
    setSyncedFrom(initialWidgets)
    setWidgets(initialWidgets)
  }

  const [addingId, setAddingId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const layout: Layout = widgets.map((widget, i) => ({
    i: widget.id,
    x: (i % 2) * WIDGET_W,
    y: Math.floor(i / 2) * WIDGET_H,
    w: WIDGET_W,
    h: WIDGET_H,
  }))

  // Order only, never size — a drag reflows row-major by resulting y then
  // x, matching how the fixed grid visually reads top-to-bottom/left-to-right.
  const handleDragStop = useCallback(
    (newLayout: Layout) => {
      const ordered = [...newLayout]
        .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))
        .map((item) => item.i)
      const byId = new Map(widgets.map((w) => [w.id, w]))
      const reordered = ordered.map((id) => byId.get(id)).filter((w): w is IndicatorDashboardWidgetData => !!w)
      setWidgets(reordered)
      setError(null)
      reorderDashboard(ordered).then((result) => {
        if (result.error) setError(result.error)
      })
    },
    [widgets]
  )

  const handleRemove = useCallback(
    async (id: string) => {
      setError(null)
      setWidgets((prev) => prev.filter((w) => w.id !== id))
      const result = await removeFromDashboard(id)
      if (result.error) {
        setError(result.error)
        return
      }
      router.refresh()
    },
    [router]
  )

  async function handleAdd() {
    if (!addingId) return
    setError(null)
    const result = await addIndicatorToDashboard(addingId)
    if (result.error) {
      setError(result.error)
      return
    }
    setAddingId('')
    router.refresh()
  }

  return (
    <div>
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {availableToAdd.length > 0 && (
        <div className="flex items-center gap-2 mb-6">
          <select
            value={addingId}
            onChange={(e) => setAddingId(e.target.value)}
            className="border border-border px-3 py-2 bg-background text-sm"
          >
            <option value="">Add an indicator…</option>
            {availableToAdd.map((option) => (
              <option key={option.id} value={option.id}>
                {option.displayName ?? option.seriesCode}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!addingId}
            className="border border-brand bg-brand text-brand-foreground px-4 py-2 text-sm font-semibold transition-colors hover:opacity-90 disabled:opacity-50"
          >
            Add to dashboard
          </button>
        </div>
      )}

      {widgets.length === 0 ? (
        <p className="text-sm text-muted">
          No indicators on your dashboard yet — add one above, or track a new indicator on{' '}
          <a href="/indicators/manage" className="underline">
            Manage Indicators
          </a>
          .
        </p>
      ) : (
        <GridLayout
          layout={layout}
          cols={12}
          rowHeight={40}
          margin={[16, 16]}
          isResizable={false}
          draggableHandle=".widget-drag-handle"
          onDragStop={handleDragStop}
        >
          {widgets.map((widget) => (
            <div key={widget.id}>
              <IndicatorDashboardWidget widget={widget} onRemove={handleRemove} />
            </div>
          ))}
        </GridLayout>
      )}
    </div>
  )
}
