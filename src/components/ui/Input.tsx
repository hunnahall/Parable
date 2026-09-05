import type { InputHTMLAttributes, SelectHTMLAttributes } from 'react'

const FIELD =
  'h-8 rounded-md border border-border bg-background px-2.5 text-base ' +
  'placeholder:text-muted transition-colors hover:border-foreground/25 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'

export function Input({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${FIELD} ${className}`} {...props} />
}

export function Select({
  className = '',
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${FIELD} ${className}`} {...props} />
}
