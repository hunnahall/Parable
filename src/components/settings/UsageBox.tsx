import { formatUsd, USAGE_WINDOW_DAYS, type UsageWindow } from '@/lib/usage/tokens'

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
// An empty window renders as a real $0.00 rather than a "nothing has
// run yet" message. That does mean a silently-broken ingest and a genuinely
// idle week look identical here — a deliberate call, made knowingly: the
// box is a spend figure, and a spend figure that sometimes isn't a number
// is worse to read than one that is.
export default function UsageBox({ usage }: { usage: UsageWindow | null }) {
  const estimatedUsd = usage?.estimatedUsd ?? 0

  return (
    <div className="card-elevated p-4 space-y-2">
      <h2 className="text-lg font-bold font-heading">Usage</h2>
      <p className="text-lg font-medium tabular-nums">
        ≈ {formatUsd(estimatedUsd)} in last {USAGE_WINDOW_DAYS} days
      </p>
    </div>
  )
}
