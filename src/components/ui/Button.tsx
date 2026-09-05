import type { ButtonHTMLAttributes } from 'react'

// The app previously carried six button treatments as copy-pasted class
// strings across a dozen files, which is why they had already drifted
// (three different paddings, two different disabled opacities). One
// component, one source of truth.
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid'
export type ButtonSize = 'sm' | 'md'

const BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-md font-medium ' +
  'transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-sm',
  md: 'h-8 px-3 text-base',
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'border border-brand bg-brand text-brand-foreground hover:opacity-90',
  secondary: 'border border-border text-foreground hover:bg-foreground/5',
  ghost: 'text-muted hover:text-foreground hover:bg-foreground/5',
  danger: 'border border-danger text-danger hover:bg-danger/10',
  'danger-solid': 'border border-danger bg-danger text-danger-foreground hover:opacity-90',
}

export default function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
}) {
  return (
    <button
      type={type}
      className={`${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  )
}
