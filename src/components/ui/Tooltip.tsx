// Inverted one-line tooltip (components.css .cw-tooltip): ink ground,
// page-colored text, no arrow. Appears after 400ms on hover or keyboard
// focus, disappears instantly. Keyboard focus only (:focus-visible): a
// clicked button keeps focus, which kept its tooltip up after the pointer
// left. Hidden while the trigger's menu is open. Pair icon-only buttons
// with an aria-label.
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
          'group-has-[:focus-visible]/tip:opacity-100 group-has-[:focus-visible]/tip:delay-[400ms] ' +
          'group-has-[[aria-haspopup][aria-expanded=true]]/tip:hidden! [@media(hover:none)]:hidden! ' +
          (side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5')
        }
      >
        {label}
      </span>
    </span>
  )
}
