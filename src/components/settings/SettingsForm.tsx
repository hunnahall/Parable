'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { UserPreferences } from '@/lib/preferences/data'
import { updatePreferences } from '@/lib/preferences/actions'
import type { UsageWindow } from '@/lib/usage/tokens'
import ExportFeedsButton from './ExportFeedsButton'
import CleanSlateSection from './CleanSlateSection'
import UsageBox from './UsageBox'

const FONT_OPTIONS: { value: UserPreferences['font']; label: string }[] = [
  { value: 'inter', label: 'Inter (default)' },
  { value: 'hanken-grotesk', label: 'Hanken Grotesk' },
  { value: 'work-sans', label: 'Work Sans' },
  { value: 'instrument-sans', label: 'Instrument Sans' },
  { value: 'lato', label: 'Lato' },
]

export default function SettingsForm({
  initialPreferences,
  // Resolved on the server: it reads ingest_runs, and there is no browser
  // Supabase client in this app.
  usage,
}: {
  initialPreferences: UserPreferences
  usage: UsageWindow | null
}) {
  const router = useRouter()
  const [prefs, setPrefs] = useState(initialPreferences)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  // No Save button — every control commits on change. Local state updates
  // immediately (so the control feels instant); the save + refresh happen
  // in the background after.
  async function applyChange(patch: Partial<UserPreferences>) {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    setStatus('saving')
    setError(null)
    const result = await updatePreferences(next)
    if (result.error !== null) {
      setStatus('error')
      setError(result.error)
      return
    }
    setStatus('saved')
    // Theme/font apply via attributes rendered on <html> in the root
    // layout (a Server Component) — a client-only state update can't
    // reach those, so this needs the real page refresh other mutations in
    // this app avoid.
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {/* Font and Usage share one row at a half each. Both hold a single
          short control or figure, so a full-width card for each was mostly
          empty space. Stacks to one column on narrow screens. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="card-elevated p-4 space-y-2">
          <h2 className="text-lg font-bold font-heading">Font</h2>
          <select
            value={prefs.font}
            onChange={(e) => applyChange({ font: e.target.value as UserPreferences['font'] })}
            className="w-full border border-border px-2 py-2 text-base bg-background"
          >
            {FONT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <UsageBox usage={usage} />
      </div>

      <div className="card-elevated p-4 space-y-2">
        <h2 className="text-lg font-bold font-heading">Rulebook</h2>
        <ul className="text-base text-muted list-disc pl-5 space-y-1">
          <li>Unread articles last 12 hours in the inbox.</li>
          <li>Archived articles last 24 hours after being archived.</li>
          <li>Saved articles are kept until you delete them.</li>
        </ul>
      </div>

      <ExportFeedsButton />

      <CleanSlateSection />

      <div className="text-lg text-muted" role="status">
        {status === 'saving' && 'Saving…'}
        {status === 'saved' && 'Saved.'}
        {status === 'error' && <span className="text-danger">{error}</span>}
      </div>
    </div>
  )
}
