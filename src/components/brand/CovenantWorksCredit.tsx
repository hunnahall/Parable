export default function CovenantWorksCredit() {
  return (
    // In normal document flow (not `fixed`) so it sits after the page's
    // real content at the true bottom of the page, rather than pinned to
    // the viewport where it could float over widgets on tall/scrollable
    // pages like the dashboard.
    <div className="flex items-center justify-end gap-1.5 opacity-70 mt-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/covenant-works-mark.svg"
        alt=""
        height={18}
        style={{ height: 18, width: 'auto' }}
      />
      <span className="text-sm font-heading font-bold text-foreground leading-none">Covenant Works</span>
    </div>
  )
}
