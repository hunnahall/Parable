'use client'

import { useEffect, useRef } from 'react'

// Level 2 modal over --scrim (components.css .cw-modal): 460px max, full
// width under 640px, fades and rises 4px over 360ms. The title is a
// question that names the object; the confirming button repeats the verb.
export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  labelledBy = 'modal-title',
}: {
  open: boolean
  onClose: () => void
  title: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  labelledBy?: string
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    panelRef.current?.focus()
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center min-[640px]:items-center min-[640px]:p-4">
      <div className="cw-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className="cw-modal animate-overlay-in relative z-[61] max-h-[90dvh] overflow-y-auto focus-visible:outline-none"
      >
        <div className="cw-modal__head">
          <h2 id={labelledBy} className="cw-modal__title">
            {title}
          </h2>
        </div>
        <div className="cw-modal__body">{children}</div>
        {footer && <div className="cw-modal__foot">{footer}</div>}
      </div>
    </div>
  )
}
