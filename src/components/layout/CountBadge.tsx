// A mono count beside a navigation item (components.css .cw-count), with
// thousands separators. Quiet by design: the Inbox count is a permanent
// fixture, not an alert.
export default function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return <span className="cw-count tabular-nums">{count.toLocaleString('en-US')}</span>
}
