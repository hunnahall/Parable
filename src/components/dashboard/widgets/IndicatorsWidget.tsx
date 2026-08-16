'use client'

import { LineChart, Line, ResponsiveContainer, YAxis, XAxis, Tooltip } from 'recharts'
import type { IndicatorData } from '@/lib/dashboard/data'
import PointTooltip from '@/components/charts/PointTooltip'

export default function IndicatorsWidget({ data }: { data: IndicatorData | null }) {
  if (!data) {
    return <p className="text-sm text-muted">Indicator not found.</p>
  }

  const { display_name, series_code, latest_value, previous_value, readings } = data
  const delta =
    latest_value !== null && previous_value !== null ? latest_value - previous_value : null
  const deltaPct =
    delta !== null && previous_value ? (delta / Math.abs(previous_value)) * 100 : null

  return (
    <div>
      <h3 className="text-sm font-medium text-foreground mb-1">{display_name ?? 'Indicator'}</h3>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-2xl font-semibold">
          {latest_value !== null ? latest_value.toLocaleString() : '—'}
        </span>
        {delta !== null && (
          <span className="text-sm text-muted">
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toLocaleString()}
            {deltaPct !== null && ` (${Math.abs(deltaPct).toFixed(1)}%)`}
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
                dot={false}
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
