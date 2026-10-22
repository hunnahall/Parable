// Empty state (components.css .cw-empty): a 96px line drawing standing on
// a ground line, a dashed frame marking space waiting to be filled, a
// plain title, one sentence on what will appear, then the first action.
// Each page has its own drawing (1.5 stroke, --fg-3, no animation: the
// logo is Parable's one drawn-line moment).
export type EmptyArt = 'pages' | 'inbox' | 'archive' | 'saved' | 'feeds' | 'filters'

const GROUND = 'M12 84 H84'

const ART: Record<EmptyArt, React.ReactNode> = {
  // A stack of pages.
  pages: (
    <>
      <path d="M30 22 H70 V78 H30 Z" />
      <path d="M24 28 V78" />
      <path d="M38 36 H62" />
      <path d="M38 46 H62" />
      <path d="M38 56 H54" />
    </>
  ),
  // An empty tray.
  inbox: (
    <>
      <path d="M16 56 L28 30 H68 L80 56 V78 H16 Z" />
      <path d="M16 56 H36 L40 64 H56 L60 56 H80" />
    </>
  ),
  // A box with its lid.
  archive: (
    <>
      <path d="M18 30 H78 V42 H18 Z" />
      <path d="M22 42 V78 H74 V42" />
      <path d="M40 54 H56" />
    </>
  ),
  // A bookmark ribbon.
  saved: (
    <>
      <path d="M32 16 H64 V78 L48 64 L32 78 Z" />
    </>
  ),
  // A feed's broadcast arcs.
  feeds: (
    <>
      <path d="M28 66 a4 4 0 1 0 0.01 0" />
      <path d="M26 46 A30 30 0 0 1 54 74" />
      <path d="M26 28 A48 48 0 0 1 72 74" />
    </>
  ),
  // A funnel.
  filters: (
    <>
      <path d="M18 22 H78 L56 48 V70 L40 78 V48 Z" />
    </>
  ),
}

export default function EmptyState({
  title,
  children,
  action,
  art = 'pages',
  className = '',
}: {
  title: string
  children?: React.ReactNode
  action?: React.ReactNode
  art?: EmptyArt
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
        {ART[art]}
        <path d={GROUND} />
      </svg>
      <h2 className="cw-empty__title">{title}</h2>
      {children && <p className="cw-empty__text">{children}</p>}
      {action}
    </div>
  )
}
