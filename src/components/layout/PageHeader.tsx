// Every app page previously opened with a bare <h1>, which the global
// type scale renders at 36-48px — a page-title jump borrowed from
// marketing pages that reads as noise above a dense list. This is the
// compact sticky header bar every comparable product uses instead: the
// title identifies the surface, the count quantifies it, and the right
// slot holds the page's one primary action.
//
// The explicit text-* class on the h1 wins because globals.css keeps its
// element-level heading rules in @layer base, which Tailwind's utilities
// layer overrides. That was not true before this change.
//
// `count` is only for a total the page genuinely knows. The article lists
// deliberately pass nothing: they're cursor-paginated, so the length they
// have in hand is the loaded page (max 30), not the real total, and
// rendering that as a count would just be wrong.
export default function PageHeader({
  title,
  count,
  actions,
}: {
  title: string
  count?: number
  actions?: React.ReactNode
}) {
  return (
    <header className="sticky top-0 z-20 flex h-12 items-center justify-between gap-4 border-b border-border-subtle bg-background/80 px-6 backdrop-blur">
      <h1 className="flex items-baseline gap-2 text-[15px] font-semibold tracking-normal">
        {title}
        {count !== undefined && count > 0 && (
          <span className="text-base font-normal text-muted tabular-nums">{count}</span>
        )}
      </h1>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  )
}
