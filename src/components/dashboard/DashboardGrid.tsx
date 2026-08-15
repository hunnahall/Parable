'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ReactGridLayout, WidthProvider, type Layout } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import { saveDashboardLayout, addWidget, removeWidget } from '@/lib/dashboard/actions'
import type { WidgetInstance, WidgetType } from '@/lib/dashboard/widgets'
import type { DashboardWidgetData } from '@/lib/dashboard/types'
import type { FeedOption, IndicatorOption } from '@/lib/dashboard/data'
import WidgetCard from './WidgetCard'
import AddWidgetMenu from './AddWidgetMenu'

const GridLayout = WidthProvider(ReactGridLayout)

export default function DashboardGrid({
  initialWidgets,
  widgetData,
  feedOptions,
  indicatorOptions,
}: {
  initialWidgets: WidgetInstance[]
  widgetData: DashboardWidgetData
  feedOptions: FeedOption[]
  indicatorOptions: IndicatorOption[]
}) {
  const [widgets, setWidgets] = useState(initialWidgets)
  // Tracks the initialWidgets reference this state was last synced from,
  // so a changed prop can be detected and applied during render — see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  // useState only seeds from initialWidgets on mount, so without this,
  // a fresh prop from router.refresh() (e.g. after adding a widget) would
  // sit unused until a full remount. Drag/resize/remove don't need this
  // since they already update `widgets` locally and directly.
  const [syncedFrom, setSyncedFrom] = useState(initialWidgets)
  if (initialWidgets !== syncedFrom) {
    setSyncedFrom(initialWidgets)
    setWidgets(initialWidgets)
  }

  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  // Fires once per completed drag/resize gesture, not per pixel — safe to
  // persist directly without debouncing. The save is a plain side effect
  // triggered from this event handler, not nested inside the setWidgets
  // updater — React can re-invoke updater functions outside of committed
  // renders, so a server-action call inside one trips "setState during
  // render" warnings.
  const handleLayoutSettled = useCallback(
    (layout: Layout) => {
      const updated = widgets.map((widget) => {
        const item = layout.find((entry) => entry.i === widget.id)
        return item ? { ...widget, x: item.x, y: item.y, w: item.w, h: item.h } : widget
      })
      setWidgets(updated)
      setError(null)
      saveDashboardLayout(updated).then((result) => {
        if (result.error) setError(result.error)
      })
    },
    [widgets]
  )

  const handleAdd = useCallback(
    async (widgetType: WidgetType, config: Record<string, string>) => {
      setError(null)
      const result = await addWidget(widgetType, config)
      if (result.error) {
        setError(result.error)
        return
      }
      router.refresh()
    },
    [router]
  )

  const handleRemove = useCallback(
    async (id: string) => {
      setError(null)
      setWidgets((prev) => prev.filter((widget) => widget.id !== id))
      const result = await removeWidget(id)
      if (result.error) {
        setError(result.error)
        return
      }
      router.refresh()
    },
    [router]
  )

  const layout: Layout = widgets.map((widget) => ({
    i: widget.id,
    x: widget.x,
    y: widget.y,
    w: widget.w,
    h: widget.h,
  }))

  return (
    <div>
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      <div className="flex justify-end mb-4">
        <AddWidgetMenu
          feedOptions={feedOptions}
          indicatorOptions={indicatorOptions}
          onAdd={handleAdd}
        />
      </div>
      {widgets.length === 0 ? (
        <p className="text-sm text-gray-500">No widgets yet — add one to get started.</p>
      ) : (
        <GridLayout
          layout={layout}
          cols={12}
          rowHeight={40}
          margin={[16, 16]}
          draggableHandle=".widget-drag-handle"
          onDragStop={handleLayoutSettled}
          onResizeStop={handleLayoutSettled}
        >
          {widgets.map((widget) => (
            <div key={widget.id}>
              <WidgetCard widget={widget} data={widgetData} onRemove={handleRemove} />
            </div>
          ))}
        </GridLayout>
      )}
    </div>
  )
}
