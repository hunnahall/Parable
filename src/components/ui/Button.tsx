import type { ComponentPropsWithoutRef } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'default' | 'compact'

const BASE =
  'inline-flex items-center justify-center font-label transition-colors disabled:opacity-50 disabled:pointer-events-none'

const SIZES: Record<ButtonSize, string> = {
  default: 'px-3 py-1.5 text-base',
  compact: 'px-2.5 py-1 text-sm',
}

// Direct systematization of patterns already in use across the app —
// zero new visual language, one place instead of N ad hoc classNames.
// Zero corner radius throughout, matching the rest of the app.
const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-foreground text-background hover:opacity-90',
  secondary: 'border border-border text-foreground hover:bg-foreground/5',
  ghost: 'text-muted hover:text-foreground',
  danger: 'border border-danger text-danger hover:bg-danger/10',
}

export default function Button({
  variant = 'secondary',
  size = 'default',
  className = '',
  ...props
}: ComponentPropsWithoutRef<'button'> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      className={`${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${className}`.trim()}
      {...props}
    />
  )
}
