// A 6px dot plus a word (components.css .cw-badge); never color alone.
export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'plain'

export default function Badge({
  tone = 'neutral',
  children,
  className = '',
}: {
  tone?: BadgeTone
  children: React.ReactNode
  className?: string
}) {
  const toneClass = tone === 'neutral' ? '' : `cw-badge--${tone}`
  return <span className={`cw-badge ${toneClass} ${className}`}>{children}</span>
}

// Mono metadata chip on --fill-active (components.css .cw-tag).
export function Tag({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`cw-tag ${className}`}>{children}</span>
}
