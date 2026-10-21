// Every app page opens with this head row: the page title (28px per the
// spec), an optional mono count, the page's actions, and an optional large
// figure on the right. Under 1000px the top bar already names the page, so
// the title here is kept for screen readers only and the row shows the
// actions with the figure below them.
//
// `count` is only for a total the page genuinely knows. `figure` is the
// page's headline number (40px, tabular) over a mono label.
export default function PageHeader({
  title,
  count,
  figure,
  actions,
  description,
  wide = false,
}: {
  title: string
  count?: number
  figure?: { value: string; label: string }
  actions?: React.ReactNode
  description?: React.ReactNode
  // Matches the page body's width so the title lines up with the content:
  // reading lists and forms are narrow, the card grid is wide.
  wide?: boolean
}) {
  const hasRow = Boolean(actions || description || figure)
  return (
    <header
      className={
        'border-b border-border ' +
        (hasRow ? 'py-3 min-[1000px]:py-5' : 'max-[999px]:sr-only min-[1000px]:py-5')
      }
    >
      <div className={`mx-auto flex flex-wrap items-center justify-between gap-3 px-4 min-[1000px]:px-8 ${wide ? 'max-w-[var(--content-max)]' : 'max-w-3xl'}`}>
        <div className="min-w-0">
          <h1 className="flex items-baseline gap-3 max-[999px]:sr-only">
            {title}
            {count !== undefined && count > 0 && (
              <span className="font-mono text-sm font-normal text-muted tabular-nums">
                {count.toLocaleString('en-US')}
              </span>
            )}
          </h1>
          {description && <p className="text-sm text-muted min-[1000px]:mt-1">{description}</p>}
        </div>
        {(actions || figure) && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 max-[999px]:w-full max-[999px]:flex-col max-[999px]:items-start">
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            {figure && (
              <div className="min-[1000px]:text-right">
                <div className="text-[length:var(--text-3xl)] font-semibold leading-none tracking-[var(--tracking-display)] tabular-nums">
                  {figure.value}
                </div>
                <div className="mt-1.5 font-mono text-2xs uppercase tracking-[var(--tracking-label)] text-muted">
                  {figure.label}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
