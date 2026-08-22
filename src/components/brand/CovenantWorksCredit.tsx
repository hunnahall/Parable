export default function CovenantWorksCredit({ className = 'mt-8' }: { className?: string }) {
  return (
    // In normal document flow (not `fixed`) by default so it sits after the
    // page's real content at the true bottom of the page, rather than pinned
    // to the viewport where it could float over widgets on tall/scrollable
    // pages like the dashboard. Pass `className` to override positioning
    // (e.g. anchoring it to a specific container on shorter pages).
    <div className={`flex items-center justify-end gap-1.5 opacity-70 text-foreground ${className}`}>
      {/* Inlined rather than <img src="..."> — currentColor doesn't resolve
          through an external image reference, and this mark needs to
          theme with the page (it's ink-only in the source file). */}
      <svg
        width="27"
        height="18"
        viewBox="15 47 130 86"
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M30 104 A50 50 0 0 1 130 104" />
        <path d="M22 126 H138" />
      </svg>
      <span className="text-sm font-heading font-bold leading-none">Covenant Works</span>
    </div>
  )
}
