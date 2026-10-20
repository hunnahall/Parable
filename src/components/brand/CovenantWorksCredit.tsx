// The suite footer every Covenant Works app carries: the Covenant mark at
// 16px in --fg-3 with "A Covenant Works app". The mark is never tinted.
export function CovenantMark({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      fill="none"
      stroke="currentColor"
      strokeWidth={size <= 16 ? 12 : size <= 24 ? 10 : 6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      <path d="M30 104 A50 50 0 0 1 130 104" />
      <path d="M22 126 H138" />
    </svg>
  )
}

export default function CovenantWorksCredit({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 text-xs text-muted ${className}`}>
      <CovenantMark size={16} />
      <span>A Covenant Works app</span>
    </div>
  )
}
