'use client'

import type { TooltipContentProps } from 'recharts/types/component/Tooltip'
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent'

function formatDateLabel(value: unknown): string {
  if (typeof value !== 'string') return String(value)
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function PointTooltip({
  active,
  payload,
  label,
  formatValue = (value) => value.toLocaleString(),
}: Partial<TooltipContentProps<ValueType, NameType>> & {
  formatValue?: (value: number) => string
}) {
  if (!active || !payload || payload.length === 0) return null

  const dateLabel = formatDateLabel(label)

  return (
    <div className="rounded border border-border bg-background px-2 py-1 text-xs shadow-sm space-y-0.5">
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-1" style={{ color: entry.color }}>
          {payload.length > 1 && entry.name && (
            <span className="font-medium">{entry.name}:</span>
          )}
          <span>
            {dateLabel} | {typeof entry.value === 'number' ? formatValue(entry.value) : entry.value}
          </span>
        </div>
      ))}
    </div>
  )
}
