'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import type { ComparisonSeries } from '@/lib/indicators/data'

const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2']

export default function CompareChart({ series }: { series: ComparisonSeries[] }) {
  if (series.length === 0) return null

  // Different series report on different dates (monthly vs quarterly vs
  // weekly). Build one unified, date-sorted dataset with one column per
  // series (keyed by indicator id) so a single <LineChart> can plot them
  // all; connectNulls on each <Line> bridges the gaps where a series has
  // no reading on a given date.
  const dateSet = new Set<string>()
  for (const s of series) {
    for (const p of s.points) dateSet.add(p.date)
  }
  const dates = Array.from(dateSet).sort()

  const pointsById = new Map(
    series.map((s) => [s.id, new Map(s.points.map((p) => [p.date, p.changePct]))])
  )

  const chartData = dates.map((date) => {
    const row: Record<string, string | number | undefined> = { date }
    for (const s of series) {
      row[s.id] = pointsById.get(s.id)?.get(date)
    }
    return row
  })

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={40} />
          <YAxis tick={{ fontSize: 11 }} unit="%" width={48} />
          <Tooltip
            formatter={(value) => (typeof value === 'number' ? `${value.toFixed(1)}%` : value)}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s, i) => (
            <Line
              key={s.id}
              type="monotone"
              dataKey={s.id}
              name={s.display_name ?? s.series_code}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
