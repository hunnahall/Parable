// A plain right-aligned number, not a filled pill. The Inbox count is a
// permanent fixture of the nav rather than an alert, and an accent-filled
// badge sitting there at all times reads as one — every comparable sidebar
// (Linear, Attio, Vercel) renders counts as quiet muted digits.
export default function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="text-xs font-medium font-data text-muted tabular-nums leading-none">
      {count > 99 ? '99+' : count}
    </span>
  )
}
