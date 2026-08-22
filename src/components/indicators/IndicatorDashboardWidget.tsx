'use client'

import { LineChart, Line, ResponsiveContainer, YAxis, XAxis, Tooltip } from 'recharts'
import { ArrowUp, ArrowDown, X } from 'lucide-react'
import type { IndicatorDashboardWidget as IndicatorDashboardWidgetData } from '@/lib/indicators/dashboard'
import PointTooltip from '@/components/charts/PointTooltip'
import OutlierDot from '@/components/charts/OutlierDot'

export default function IndicatorDashboardWidget({
  widget,
  onRemove,
}: {
  widget: IndicatorDashboardWidgetData
  onRemove: (id: string) => void
}) {
  const { displayName, seriesCode, latestValue, previousValue, readings } = widget
  const delta = latestValue !== null && previousValue !== null ? latestValue - previousValue : null
  const deltaPct = delta !== null && previousValue ? (delta / Math.abs(previousValue)) * 100 : null

  return (
    <div className="h-full flex flex-col border border-border bg-background overflow-hidden">
      <div className="widget-drag-handle flex items-center justify-between px-3 py-2 border-b border-border cursor-move shrink-0">
        <span className="text-sm font-semibold text-foreground truncate">
          {displayName ?? seriesCode}
        </span>
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => onRemove(widget.id)}
          className="flex items-center justify-center w-5 h-5 text-muted hover:bg-foreground/5 hover:text-foreground shrink-0"
          aria-label="Remove from dashboard"
        >
          <X size={14} />
        </button>
      </div>
      <div className="p-4 flex flex-col grow min-h-0">
        <div className="flex items-baseline gap-2 mb-3 flex-wrap shrink-0">
          <span className="text-3xl font-semibold font-data">
            {latestValue !== null ? latestValue.toLocaleString() : '—'}
          </span>
          {delta !== null && (
            <span
              className={
                delta >= 0
                  ? 'inline-flex items-center gap-0.5 text-xs font-medium text-green-700'
                  : 'inline-flex items-center gap-0.5 text-xs font-medium text-red-700'
              }
            >
              {delta >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
              {Math.abs(delta).toLocaleString()}
              {deltaPct !== null && ` (${Math.abs(deltaPct).toFixed(1)}%)`}
            </span>
          )}
        </div>
        {readings.length > 1 ? (
          <div className="grow min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={readings}>
                <YAxis domain={['dataMin', 'dataMax']} hide />
                <XAxis dataKey="date" hide />
                <Tooltip content={<PointTooltip />} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="currentColor"
                  className="text-accent"
                  strokeWidth={2}
                  dot={<OutlierDot />}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-muted">Not enough readings yet.</p>
        )}
      </div>
    </div>
  )
}
