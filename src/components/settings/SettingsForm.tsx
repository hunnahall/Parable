'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { UserPreferences } from '@/lib/preferences/data'
import { updatePreferences } from '@/lib/preferences/actions'

const FONT_OPTIONS: { value: UserPreferences['font']; label: string }[] = [
  { value: 'inter', label: 'Inter (default)' },
  { value: 'hanken-grotesk', label: 'Hanken Grotesk' },
  { value: 'work-sans', label: 'Work Sans' },
  { value: 'instrument-sans', label: 'Instrument Sans' },
  { value: 'lato', label: 'Lato' },
]

function timezoneOptions(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    // Older engines without the Intl enumeration API — fall back to just
    // the browser's own zone so the picker still has something usable.
    return [Intl.DateTimeFormat().resolvedOptions().timeZone]
  }
}

export default function SettingsForm({ initialPreferences }: { initialPreferences: UserPreferences }) {
  const router = useRouter()
  const [prefs, setPrefs] = useState(initialPreferences)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  // Computed once per mount, not per render — Intl.supportedValuesOf
  // returns several hundred zones and never changes during a session.
  const zones = useMemo(() => timezoneOptions(), [])
  const detectedZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])

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
      <div className="border border-border p-4 space-y-2">
        <h2 className="text-sm font-medium font-heading">Font</h2>
        <p className="text-xs text-muted">
          Applies to body text throughout the app — headings stay Hanken Grotesk.
        </p>
        <select
          value={prefs.font}
          onChange={(e) => applyChange({ font: e.target.value as UserPreferences['font'] })}
          className="w-full border border-border px-3 py-2 text-sm bg-background"
        >
          {FONT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="border border-border p-4 space-y-2">
        <h2 className="text-sm font-medium font-heading">Timezone</h2>
        <p className="text-xs text-muted">
          Auto-detect uses your browser&rsquo;s timezone ({detectedZone}) without needing to pick one.
        </p>
        <select
          value={prefs.timezone}
          onChange={(e) => applyChange({ timezone: e.target.value })}
          className="w-full border border-border px-3 py-2 text-sm bg-background"
        >
          <option value="">Auto-detect ({detectedZone})</option>
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
      </div>

      <div className="border border-border p-4 space-y-2">
        <h2 className="text-sm font-medium font-heading">Clock</h2>
        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="clockFormat"
              checked={prefs.clockFormat === '24h'}
              onChange={() => applyChange({ clockFormat: '24h' })}
            />
            24-hour
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="clockFormat"
              checked={prefs.clockFormat === '12h'}
              onChange={() => applyChange({ clockFormat: '12h' })}
            />
            12-hour
          </label>
        </div>
      </div>

      <div className="border border-border p-4 space-y-2">
        <h2 className="text-sm font-medium font-heading">Theme</h2>
        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="theme"
              checked={prefs.theme === 'system'}
              onChange={() => applyChange({ theme: 'system' })}
            />
            System
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="theme"
              checked={prefs.theme === 'light'}
              onChange={() => applyChange({ theme: 'light' })}
            />
            Light
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="theme"
              checked={prefs.theme === 'dark'}
              onChange={() => applyChange({ theme: 'dark' })}
            />
            Dark
          </label>
        </div>
      </div>

      <div className="text-sm text-muted" role="status">
        {status === 'saving' && 'Saving…'}
        {status === 'saved' && 'Saved.'}
        {status === 'error' && <span className="text-red-600">{error}</span>}
      </div>
    </div>
  )
}
