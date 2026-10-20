import type { ButtonHTMLAttributes } from 'react'

// Covenant Works buttons (components.css .cw-btn). Primary is ink; accent
// (the signature color) is for one button per screen, the screen's most
// frequent action; danger is outlined and fills red only inside a confirm
// step (danger-solid). While an action runs, callers swap the label for
// the action in progress ("Archiving") and disable the button. No spinners.
export type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'ghost' | 'danger' | 'danger-solid'
export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'cw-btn--primary',
  secondary: 'cw-btn--secondary',
  accent: 'cw-btn--accent',
  ghost: 'cw-btn--ghost',
  danger: 'cw-btn--danger',
  'danger-solid': 'cw-btn--danger-solid',
}

const SIZES: Record<ButtonSize, string> = { sm: 'cw-btn--sm', md: '', lg: 'cw-btn--lg' }

export function buttonClass({
  variant = 'secondary',
  size = 'md',
  icon = false,
}: { variant?: ButtonVariant; size?: ButtonSize; icon?: boolean } = {}) {
  return ['cw-btn', VARIANTS[variant], SIZES[size], icon ? 'cw-btn--icon' : ''].filter(Boolean).join(' ')
}

export default function Button({
  variant = 'secondary',
  size = 'md',
  icon = false,
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  // Square icon-only button; pass aria-label and title.
  icon?: boolean
}) {
  return <button type={type} className={`${buttonClass({ variant, size, icon })} ${className}`} {...props} />
}
