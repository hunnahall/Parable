'use client'

import { LineChart, Line, ResponsiveContainer, YAxis, XAxis, Tooltip } from 'recharts'
import { ArrowUp, ArrowDown, TriangleAlert } from 'lucide-react'
import type { IndicatorData } from '@/lib/dashboard/data'
import PointTooltip from '@/components/charts/PointTooltip'
import OutlierDot from '@/components/charts/OutlierDot'

export default function IndicatorsWidget({ data }: { data: IndicatorData | null }) {
  if (!data) {
    return <p className="text-sm text-muted">Indicator not found.</p>
  }

  const { display_name, series_code, latest_value, previous_value, readings, notable } = data
  const delta =
    latest_value !== null && previous_value !== null ? latest_value - previous_value : null
  const deltaPct =
    delta !== null && previous_value ? (delta / Math.abs(previous_value)) * 100 : null

  return (
    <div>
      <h3 className="text-sm font-medium text-foreground mb-1">{display_name ?? 'Indicator'}</h3>
      <div className="flex items-baseline gap-2 mb-2 flex-wrap">
        <span className="text-2xl font-semibold">
          {latest_value !== null ? latest_value.toLocaleString() : '—'}
        </span>
        {delta !== null && (
          <span
            className={
              delta >= 0
                ? 'inline-flex items-center gap-0.5 text-xs font-medium bg-green-50 text-green-700 px-2 py-0.5'
                : 'inline-flex items-center gap-0.5 text-xs font-medium bg-red-50 text-red-700 px-2 py-0.5'
            }
          >
            {delta >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
            {Math.abs(delta).toLocaleString()}
            {deltaPct !== null && ` (${Math.abs(deltaPct).toFixed(1)}%)`}
          </span>
        )}
        {notable && (
          <span
            className="inline-flex items-center gap-1 text-xs font-medium bg-amber-50 text-amber-700 px-2 py-0.5"
            title="This reading is a statistical outlier relative to its recent history"
          >
            <TriangleAlert size={12} />
            Notable move
          </span>
        )}
      </div>
      {readings.length > 1 && (
        <div className="h-16">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={readings}>
              <YAxis domain={['dataMin', 'dataMax']} hide />
              <XAxis dataKey="date" hide />
              <Tooltip content={<PointTooltip />} />
              <Line
                type="monotone"
                dataKey="value"
                stroke="currentColor"
                className="text-foreground"
                strokeWidth={2}
                dot={<OutlierDot />}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <a
        href={`https://fred.stlouisfed.org/series/${series_code}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-muted hover:underline mt-2 block"
      >
        Source: FRED®, Federal Reserve Bank of St. Louis
      </a>
    </div>
  )
}
