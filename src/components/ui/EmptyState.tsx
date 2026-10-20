// Empty state (components.css .cw-empty): a 96px line drawing standing on
// a ground line, a dashed frame marking space waiting to be filled, a
// plain title, one sentence on what will appear, then the first action.
export default function EmptyState({
  title,
  children,
  action,
  className = '',
}: {
  title: string
  children?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={`cw-empty ${className}`}>
      <svg
        viewBox="0 0 96 96"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {/* A stack of pages on a ground line. */}
        <path d="M30 22 H70 V78 H30 Z" />
        <path d="M24 28 V78" />
        <path d="M38 36 H62" />
        <path d="M38 46 H62" />
        <path d="M38 56 H54" />
        <path d="M12 84 H84" />
      </svg>
      <h2 className="cw-empty__title">{title}</h2>
      {children && <p className="cw-empty__text">{children}</p>}
      {action}
    </div>
  )
}
