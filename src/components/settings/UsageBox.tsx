'use client'

import { useSyncExternalStore } from 'react'
import { formatUsd, MONTHLY_TARGET_USD, USAGE_WINDOW_DAYS, type SpendEntry, type UsageWindow } from '@/lib/usage/tokens'

const noopSubscribe = () => () => {}

// Days are the reader's own, which only the browser knows, so the chart
// draws after hydration (the server render shows the totals only).
function useIsClient(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false)
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

// Rolling AI spend: the shared ingest job (ingest_runs) plus every
// on-demand summary and reader view (ai_usage). A property of the project,
// not of one account, since every subscriber reads the same rows. An
// estimate from hard-coded per-1M prices, hence "≈": it's here to catch an
// order-of-magnitude change, not to reconcile an invoice.
//
// A bar per day for the last week (today in the accent, earlier days in ink
// at 22%), a dashed line at each day's share of the monthly target, and the
// month so far against that target (warning from 90%, danger past 100%).
export default function UsageBox({ usage, spend }: { usage: UsageWindow | null; spend: SpendEntry[] }) {
  const isClient = useIsClient()
  const estimatedUsd = usage?.estimatedUsd ?? 0

  return (
    <section className="cw-panel">
      <div className="cw-panel__head">
        <h2 className="cw-panel__title">Usage</h2>
        <span className="font-mono text-2xs text-muted">≈ {formatUsd(estimatedUsd)} in {USAGE_WINDOW_DAYS} days</span>
      </div>
      <div className="cw-panel__body">{isClient ? <SpendCharts spend={spend} /> : <div className="h-48" />}</div>
    </section>
  )
}

function SpendCharts({ spend }: { spend: SpendEntry[] }) {
  const now = new Date()
  const byDay = new Map<string, number>()
  let monthToDate = 0
  for (const entry of spend) {
    const at = new Date(entry.at)
    byDay.set(dayKey(at), (byDay.get(dayKey(at)) ?? 0) + entry.usd)
    if (at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth()) monthToDate += entry.usd
  }

  const days = Array.from({ length: USAGE_WINDOW_DAYS }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (USAGE_WINDOW_DAYS - 1 - i))
    return {
      key: dayKey(d),
      label: d.toLocaleDateString(undefined, { weekday: 'short' }),
      full: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      usd: byDay.get(dayKey(d)) ?? 0,
      today: i === USAGE_WINDOW_DAYS - 1,
    }
  })

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const dailyShare = MONTHLY_TARGET_USD / daysInMonth
  // Headroom above the taller of the highest bar and the reference line.
  const scale = Math.max(dailyShare, ...days.map((d) => d.usd)) * 1.15
  const monthShare = monthToDate / MONTHLY_TARGET_USD
  const monthTone = monthShare > 1 ? 'cw-progress--danger' : monthShare >= 0.9 ? 'cw-progress--warning' : ''
  const monthName = now.toLocaleDateString(undefined, { month: 'long' })

  return (
    <div className="space-y-6">
      <figure className="space-y-2">
        <figcaption className="cw-eyebrow">API spend by day</figcaption>
        <div className="relative">
          <div
            role="img"
            aria-label={`API spend by day: ${days.map((d) => `${d.full} ${formatUsd(d.usd)}`).join(', ')}. Daily share of the ${formatUsd(MONTHLY_TARGET_USD)} monthly target: ${formatUsd(dailyShare)}.`}
            className="relative grid h-28 grid-cols-7 items-end gap-2 border-b border-rule"
          >
            {days.map((day) => (
              <div key={day.key} className="flex h-full flex-col justify-end" title={`${day.full}: ${formatUsd(day.usd)}`}>
                <div
                  className={day.today ? 'bg-accent' : ''}
                  style={{
                    height: `${(day.usd / scale) * 100}%`,
                    minHeight: day.usd > 0 ? 2 : 0,
                    background: day.today ? undefined : 'color-mix(in srgb, var(--fg) 22%, transparent)',
                  }}
                />
              </div>
            ))}
            {/* Each day's share of the monthly target. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 border-t border-dashed border-foreground-muted"
              style={{ bottom: `${(dailyShare / scale) * 100}%` }}
            >
              <span className="absolute -top-4 right-0 font-mono text-2xs text-muted">
                {formatUsd(dailyShare)} a day target
              </span>
            </div>
          </div>
          <div className="mt-1.5 grid grid-cols-7 gap-2 font-mono text-2xs text-muted" aria-hidden="true">
            {days.map((day) => (
              <span key={day.key} className={`text-center ${day.today ? 'text-foreground' : ''}`}>
                {day.today ? 'Today' : day.label}
              </span>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted">
          Today so far: <span className="font-mono tabular-nums text-foreground">{formatUsd(days[days.length - 1].usd)}</span>
        </p>
      </figure>

      <div className="space-y-2">
        <p className="flex items-baseline justify-between gap-3 text-sm">
          <span>{monthName} so far</span>
          <span className="font-mono tabular-nums">
            {formatUsd(monthToDate)} of {formatUsd(MONTHLY_TARGET_USD)}
          </span>
        </p>
        <div
          className={`cw-progress ${monthTone}`}
          role="progressbar"
          aria-label={`${monthName} API spend against the monthly target`}
          aria-valuemin={0}
          aria-valuemax={MONTHLY_TARGET_USD}
          aria-valuenow={Number(monthToDate.toFixed(2))}
        >
          <span style={{ width: `${Math.min(100, monthShare * 100)}%` }} />
        </div>
      </div>
    </div>
  )
}
