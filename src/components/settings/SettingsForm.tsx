'use client'

import { useState } from 'react'
import type { ThemeChoice, UserPreferences } from '@/lib/preferences/data'
import { updatePreferences } from '@/lib/preferences/actions'
import { applyTheme } from '@/lib/preferences/applyTheme'
import type { UsageWindow } from '@/lib/usage/tokens'
import Segmented from '@/components/ui/Segmented'
import { useToast } from '@/components/ui/Toast'
import SettingsActions from './SettingsActions'
import UsageBox from './UsageBox'

const THEME_OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
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
  const toast = useToast()
  const [theme, setTheme] = useState(initialPreferences.theme)

  // No Save button: the theme applies on the page at once and is saved in
  // the background, so the server renders it on every later visit.
  async function changeTheme(next: ThemeChoice) {
    const previous = theme
    setTheme(next)
    applyTheme(next)
    const result = await updatePreferences({ theme: next })
    if (result.error !== null) {
      setTheme(previous)
      applyTheme(previous)
      toast(`Theme not saved. ${result.error}`, 'danger')
    }
  }

  return (
    <div className="space-y-6">
      {/* Theme and Usage share one row at a half each; one column on phones. */}
      <div className="grid grid-cols-1 gap-4 min-[640px]:grid-cols-2">
        <section className="cw-panel">
          <div className="cw-panel__head">
            <h2 className="cw-panel__title">Theme</h2>
          </div>
          <div className="cw-panel__body space-y-2">
            <Segmented label="Theme" options={THEME_OPTIONS} value={theme} onChange={changeTheme} />
            <p className="text-xs text-muted">System follows your device.</p>
          </div>
        </section>

        <UsageBox usage={usage} />
      </div>

      <SettingsActions />
    </div>
  )
}
