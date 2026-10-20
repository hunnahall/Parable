// Inverted one-line tooltip (components.css .cw-tooltip): ink ground,
// page-colored text, no arrow. Appears after 400ms on hover or keyboard
// focus, disappears instantly. Pair icon-only buttons with an aria-label.
export default function Tooltip({
  label,
  children,
  side = 'top',
}: {
  label: string
  children: React.ReactNode
  side?: 'top' | 'bottom'
}) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={
          'cw-tooltip pointer-events-none absolute left-1/2 z-[70] -translate-x-1/2 whitespace-nowrap opacity-0 ' +
          'transition-opacity duration-0 group-hover/tip:opacity-100 group-hover/tip:delay-[400ms] ' +
          'group-focus-within/tip:opacity-100 group-focus-within/tip:delay-[400ms] [@media(hover:none)]:hidden ' +
          (side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5')
        }
      >
        {label}
      </span>
    </span>
  )
}
