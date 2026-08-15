'use client'

import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts'
import type { IndicatorData } from '@/lib/dashboard/data'

export default function IndicatorsWidget({ data }: { data: IndicatorData | null }) {
  if (!data) {
    return <p className="text-sm text-gray-500">Indicator not found.</p>
  }

  const { display_name, latest_value, previous_value, readings } = data
  const delta =
    latest_value !== null && previous_value !== null ? latest_value - previous_value : null
  const deltaPct =
    delta !== null && previous_value ? (delta / Math.abs(previous_value)) * 100 : null

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-700 mb-1">{display_name ?? 'Indicator'}</h3>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-2xl font-semibold">
          {latest_value !== null ? latest_value.toLocaleString() : '—'}
        </span>
        {delta !== null && (
          <span className="text-sm text-gray-500">
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
              <Line
                type="monotone"
                dataKey="value"
                stroke="currentColor"
                className="text-gray-700"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
