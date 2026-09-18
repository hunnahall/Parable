import {
  formatTokenCount,
  formatUsd,
  USAGE_WINDOW_DAYS,
  type UsageWindow,
} from '@/lib/usage/data'

// Rolling token spend for the shared ingest job.
//
// Not a per-account figure and deliberately not labelled as one: ingest is
// one background job writing rows every subscriber reads, so what it costs
// is a property of the project. Summed from ingest_runs, which is the
// persistent half of the token accounting in src/lib/usage/tokens.ts.
//
// The cost is an estimate from hard-coded per-1M prices, hence "≈" — it is
// here to catch an order-of-magnitude change after a pipeline edit, not to
// reconcile against an invoice.
export default function UsageBox({ usage }: { usage: UsageWindow | null }) {
  return (
    <div className="card-elevated p-4 space-y-2">
      <h2 className="text-lg font-bold font-heading">Usage</h2>
      {!usage || usage.runs === 0 ? (
        // Distinct from "$0.00", which would read as a confident zero
        // rather than an absence of data — exactly the ambiguity that let
        // a silently-broken ingest go unnoticed for thirteen days.
        <p className="text-base text-muted">No ingest runs yet.</p>
      ) : (
        <div>
          <p className="text-lg font-medium tabular-nums">
            {formatTokenCount(usage.totalTokens)} tokens
          </p>
          <p className="text-base text-muted tabular-nums">≈ {formatUsd(usage.estimatedUsd)}</p>
          <p className="text-sm text-muted">last {USAGE_WINDOW_DAYS} days</p>
        </div>
      )}
    </div>
  )
}
