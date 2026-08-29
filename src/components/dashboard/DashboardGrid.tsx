'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Responsive, WidthProvider, type Layout } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import { saveDashboardLayout, addWidget, removeWidget } from '@/lib/dashboard/actions'
import type { WidgetInstance, WidgetType } from '@/lib/dashboard/widgets'
import type { DashboardWidgetData } from '@/lib/dashboard/types'
import type { FeedOption } from '@/lib/dashboard/data'
import WidgetCard from './WidgetCard'
import AddWidgetMenu from './AddWidgetMenu'

const GridLayout = WidthProvider(Responsive)

// Matches the md: breakpoint the rest of the shell (Sidebar,
// MobileSidebarDrawer) uses to switch between the desktop sidebar and the
// mobile drawer nav, so the widget grid and the nav collapse at the same
// width. Below it, widgets stack full-width in a single column — dragging
// and resizing are disabled there since a 1-column stack can't express a
// meaningful x/w and we only persist one set of x/y/w/h per widget.
const BREAKPOINTS = { lg: 768, xxs: 0 }
const COLS = { lg: 12, xxs: 1 }

export default function DashboardGrid({
  initialWidgets,
  widgetData,
  feedOptions,
  categoryOptions,
}: {
  initialWidgets: WidgetInstance[]
  widgetData: DashboardWidgetData
  feedOptions: FeedOption[]
  categoryOptions: string[]
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
  const [breakpoint, setBreakpoint] = useState<keyof typeof BREAKPOINTS>('lg')
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
    async (
      widgetType: WidgetType,
      config: Record<string, string>,
      size?: { w: number; h: number }
    ) => {
      setError(null)
      const result = await addWidget(widgetType, config, size)
      if (result.error !== null) {
        setError(result.error)
        return
      }
      // Append the row the insert returned instead of waiting on
      // router.refresh() — see handleRemove below and ArticleList.tsx for
      // why gating a visible change on that full-page refetch is slow.
      setWidgets((prev) => [...prev, result.widget])
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
      {error && <p className="text-lg text-danger mb-4">{error}</p>}
      <div className="flex justify-end mb-4">
        <AddWidgetMenu
          feedOptions={feedOptions}
          categoryOptions={categoryOptions}
          onAdd={handleAdd}
        />
      </div>
      {widgets.length === 0 ? (
        <div className="relative py-24 text-center">
          <div className="empty-state-watermark" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/parable-mark.svg" alt="" className="w-56 h-56" />
          </div>
          <p className="relative text-lg text-muted">No widgets yet — add one to get started.</p>
        </div>
      ) : (
        <GridLayout
          layouts={{ lg: layout }}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          rowHeight={40}
          margin={[16, 16]}
          draggableHandle=".widget-drag-handle"
          isDraggable={breakpoint === 'lg'}
          isResizable={breakpoint === 'lg'}
          onBreakpointChange={(newBreakpoint) =>
            setBreakpoint(newBreakpoint as keyof typeof BREAKPOINTS)
          }
          onDragStop={handleLayoutSettled}
          onResizeStop={handleLayoutSettled}
        >
          {widgets.map((widget, i) => (
            <div key={widget.id}>
              <WidgetCard
                widget={widget}
                data={widgetData}
                onRemove={handleRemove}
                revealDelayMs={Math.min(i, 10) * 40}
              />
            </div>
          ))}
        </GridLayout>
      )}
    </div>
  )
}
