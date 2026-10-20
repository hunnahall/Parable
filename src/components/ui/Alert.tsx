import { AlertTriangle, CircleAlert, CircleCheck, Info } from 'lucide-react'

// Inline alert (components.css .cw-alert): full hairline in the status
// color at 45%, a soft background, text stays --fg. Says what happened and
// what to do next.
export type AlertTone = 'info' | 'warning' | 'danger' | 'success'

const ICONS = { info: Info, warning: AlertTriangle, danger: CircleAlert, success: CircleCheck }

export default function Alert({
  tone = 'info',
  title,
  children,
  className = '',
}: {
  tone?: AlertTone
  title: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  const Icon = ICONS[tone]
  const toneClass = tone === 'info' ? '' : `cw-alert--${tone}`
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`cw-alert ${toneClass} ${className}`}>
      <Icon strokeWidth={1.5} aria-hidden="true" />
      <div className="cw-alert__title">{title}</div>
      {children && <div className="cw-alert__text">{children}</div>}
    </div>
  )
}
