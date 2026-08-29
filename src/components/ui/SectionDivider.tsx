// Generalizes SidebarDivider's hairline pattern for use outside the
// sidebar — a lightweight `border-t` for separating sub-regions within
// one already-elevated surface (e.g. a filter bar from the list below
// it), distinct from `.card-elevated`, which is for a self-contained
// addressable unit (a widget, a modal, a whole Settings section).
export default function SectionDivider({ className = '' }: { className?: string }) {
  return <div className={`border-t border-border-subtle ${className}`} role="separator" />
}
