'use client'

// Switches a view of the same data (components.css .cw-seg). The selected
// segment takes --fill-active and stays neutral.
export default function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled = false,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  label: string
  disabled?: boolean
}) {
  return (
    <div className="cw-seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
