'use client'

import { useState } from 'react'
import CleanSlateDialog from './CleanSlateDialog'

export default function CleanSlateSection() {
  const [open, setOpen] = useState(false)

  return (
    <div className="card-elevated p-4 space-y-2 border-danger/30">
      <h2 className="text-base font-bold font-heading">Clean slate</h2>
      <p className="text-xs text-muted">
        Archive your unread inbox, or wipe your account entirely and start over.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border border-danger text-danger px-4 py-2 text-sm hover:bg-danger/10 transition-colors"
      >
        Clean slate…
      </button>

      {open && <CleanSlateDialog onClose={() => setOpen(false)} />}
    </div>
  )
}
