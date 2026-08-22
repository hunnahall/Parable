// The one deliberate rounded-full element in an otherwise zero-radius
// design system — a numeric count badge is the conventional exception to
// the "ink on paper, hairline rules, zero radius" rule (see globals.css).
export default function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-accent text-accent-foreground text-[11px] font-medium font-data leading-none">
      {count > 99 ? '99+' : count}
    </span>
  )
}
