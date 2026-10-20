import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'

// Covenant Works fields (components.css .cw-input and friends): 32px,
// surface ground, strong hairline, signature-color focus ring.
export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`cw-input ${className}`} {...props} />
}

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`cw-textarea ${className}`} {...props} />
}

export function Select({
  className = '',
  wrapClassName = '',
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { wrapClassName?: string }) {
  return (
    <span className={`cw-select-wrap ${wrapClassName}`}>
      <select className={`cw-select ${className}`} {...props} />
    </span>
  )
}

// Label above (13 medium, --fg-2), the control, then help or error (12).
export function Field({
  label,
  htmlFor,
  help,
  error,
  className = '',
  children,
}: {
  label: ReactNode
  htmlFor?: string
  help?: ReactNode
  error?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`cw-field ${className}`}>
      <label className="cw-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? <p className="cw-error">{error}</p> : help ? <p className="cw-help">{help}</p> : null}
    </div>
  )
}

export function Checkbox({
  label,
  className = '',
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label?: ReactNode }) {
  return (
    <label className={`cw-check ${className}`}>
      <input type="checkbox" {...props} />
      {label}
    </label>
  )
}

export function Switch({
  label,
  className = '',
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label?: ReactNode }) {
  return (
    <label className={`cw-switch ${className}`}>
      <input type="checkbox" role="switch" {...props} />
      {label}
    </label>
  )
}
