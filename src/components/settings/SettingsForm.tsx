'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { UserPreferences } from '@/lib/preferences/data'
import { updatePreferences } from '@/lib/preferences/actions'
import { SUPPORTED_LANGUAGES } from '@/lib/languages'
import ExportFeedsButton from './ExportFeedsButton'
import CleanSlateSection from './CleanSlateSection'

const FONT_OPTIONS: { value: UserPreferences['font']; label: string }[] = [
  { value: 'inter', label: 'Inter (default)' },
  { value: 'hanken-grotesk', label: 'Hanken Grotesk' },
  { value: 'work-sans', label: 'Work Sans' },
  { value: 'instrument-sans', label: 'Instrument Sans' },
  { value: 'lato', label: 'Lato' },
]

export default function SettingsForm({ initialPreferences }: { initialPreferences: UserPreferences }) {
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
      <div className="card-elevated p-4 space-y-2">
        <h2 className="text-lg font-bold font-heading">Font</h2>
        <select
          value={prefs.font}
          onChange={(e) => applyChange({ font: e.target.value as UserPreferences['font'] })}
          className="w-full border border-border px-3 py-2 text-lg bg-background"
        >
          {FONT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="card-elevated p-4 space-y-2">
        <h2 className="text-lg font-bold font-heading">Language</h2>
        <p className="text-base text-muted">
          Titles and summaries are translated into this language automatically. Other content is
          translated when opened.
        </p>
        <select
          value={prefs.language}
          onChange={(e) => applyChange({ language: e.target.value })}
          className="w-full border border-border px-3 py-2 text-lg bg-background"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>

      <div className="card-elevated p-4 space-y-2">
        <h2 className="text-lg font-bold font-heading">Rulebook</h2>
        <ul className="text-base text-muted list-disc pl-5 space-y-1">
          <li>Untouched articles auto-archive after 24 hours.</li>
          <li>Archived articles&apos; cached full text is cleared after 7 days.</li>
          <li>Archived articles&apos; metadata is cleared after 30 days.</li>
          <li>Items in Read and Save are never auto-archived or deleted.</li>
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
