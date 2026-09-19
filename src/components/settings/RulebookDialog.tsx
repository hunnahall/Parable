'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'

// The retention rules, previously a permanent card on /settings. They are
// reference material the reader checks once, not a setting — so they live
// behind a button now.
export default function RulebookDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-foreground/40 transition-opacity duration-[var(--motion-standard)]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Rulebook"
        className="card-modal absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Rulebook</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted hover:text-foreground transition-colors"
          >
            <X size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        <ul className="text-base text-muted list-disc pl-5 space-y-1">
          <li>Unread articles last 12 hours in the inbox.</li>
          <li>Archived articles last 24 hours after being archived.</li>
          <li>Saved articles are kept until you delete them.</li>
        </ul>
      </div>
    </div>
  )
}
