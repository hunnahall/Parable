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
import PointTooltip from '@/components/charts/PointTooltip'
import OutlierDot from '@/components/charts/OutlierDot'

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
  // Kept as a per-series (date -> notable) lookup rather than folded into
  // chartData's rows: outlier flags are computed per series over its own
  // raw reading sequence (before this file's date-union reshaping, which
  // would corrupt the z-score across gaps where series don't share dates)
  // — see getComparisonData. A custom `dot` renderer below reads from this
  // closure per point instead.
  const notableById = new Map(
    series.map((s) => [s.id, new Map(s.points.map((p) => [p.date, p.notable]))])
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
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={40} />
          <YAxis tick={{ fontSize: 11 }} unit="%" width={48} />
          <Tooltip
            content={<PointTooltip formatValue={(value) => `${value.toFixed(1)}%`} />}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s, i) => {
            const notableByDate = notableById.get(s.id)
            // recharts instantiates `dot` with its own loosely-typed
            // DotItemDotProps (payload is `any` in recharts' own types) —
            // matched loosely here rather than fighting that typing.
            const seriesDot = (dotProps: { cx?: number; cy?: number; payload?: { date: string } }) => (
              <OutlierDot
                cx={dotProps.cx}
                cy={dotProps.cy}
                payload={{ notable: notableByDate?.get(dotProps.payload?.date ?? '') }}
              />
            )
            return (
              <Line
                key={s.id}
                type="monotone"
                dataKey={s.id}
                name={s.display_name ?? s.series_code}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={seriesDot}
                connectNulls
              />
            )
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
