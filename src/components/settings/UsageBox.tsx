import { formatUsd, USAGE_WINDOW_DAYS, type UsageWindow } from '@/lib/usage/tokens'

// Rolling spend for the shared ingest job, summed from ingest_runs. A
// property of the project, not of one account, since every subscriber
// reads the same rows. An estimate from hard-coded per-1M prices, hence
// "≈": it's here to catch an order-of-magnitude change, not to reconcile
// an invoice. An empty window reads $0.00.
export default function UsageBox({ usage }: { usage: UsageWindow | null }) {
  const estimatedUsd = usage?.estimatedUsd ?? 0

  return (
    <section className="cw-panel">
      <div className="cw-panel__head">
        <h2 className="cw-panel__title">Usage</h2>
      </div>
      <div className="cw-panel__body cw-stat">
        <span className="cw-eyebrow">API spend · last {USAGE_WINDOW_DAYS} days</span>
        <span className="cw-stat__value">≈ {formatUsd(estimatedUsd)}</span>
      </div>
    </section>
  )
}
