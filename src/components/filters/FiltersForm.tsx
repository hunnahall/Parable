'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import type { UserPreferences } from '@/lib/preferences/data'
import { updatePreferences } from '@/lib/preferences/actions'
import { runAutoDeleteRulesNow } from '@/lib/settings/actions'

export default function FiltersForm({ initialPreferences }: { initialPreferences: UserPreferences }) {
  const router = useRouter()
  const [prefs, setPrefs] = useState(initialPreferences)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [filterInput, setFilterInput] = useState('')
  const [runningRules, setRunningRules] = useState(false)
  const [rulesRunResult, setRulesRunResult] = useState<string | null>(null)

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
    router.refresh()
  }

  function addFilter() {
    const trimmed = filterInput.trim()
    if (!trimmed) return
    setFilterInput('')
    if (prefs.autoDeleteKeywords.some((word) => word.toLowerCase() === trimmed.toLowerCase())) return
    setRulesRunResult(null)
    applyChange({ autoDeleteKeywords: [...prefs.autoDeleteKeywords, trimmed] })
  }

  function removeFilter(word: string) {
    setRulesRunResult(null)
    applyChange({ autoDeleteKeywords: prefs.autoDeleteKeywords.filter((k) => k !== word) })
  }

  async function handleRunRulesNow() {
    setRunningRules(true)
    setRulesRunResult(null)
    const result = await runAutoDeleteRulesNow()
    setRunningRules(false)
    if (result.error !== null) {
      setRulesRunResult(result.error)
      return
    }
    setRulesRunResult(
      result.deletedCount === 0
        ? 'No matching articles found.'
        : `Deleted ${result.deletedCount} article${result.deletedCount === 1 ? '' : 's'}.`
    )
    // Removed articles affect the Inbox list and the sidebar's unread
    // count, both server-rendered — a client-only state update can't reach
    // either.
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="card-elevated p-4 space-y-2">
        <p className="text-base text-muted">
          New articles with a title matching one of these filters will be automatically
          discarded. A filter can be a single word or a phrase.
        </p>
        <label className="flex items-center gap-1.5 text-base">
          <input
            type="checkbox"
            checked={prefs.autoDeleteEnabled}
            onChange={(e) => applyChange({ autoDeleteEnabled: e.target.checked })}
          />
          Enabled
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={filterInput}
            onChange={(e) => setFilterInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addFilter()
              }
            }}
            placeholder="e.g. soccer or transfer rumors"
            className="flex-1 border border-border px-3 py-2 text-lg bg-background"
          />
          <button
            type="button"
            onClick={addFilter}
            className="border border-border px-3 py-2 text-base hover:bg-foreground/5 transition-colors"
          >
            Add
          </button>
        </div>
        {prefs.autoDeleteKeywords.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {prefs.autoDeleteKeywords.map((word) => (
              <li
                key={word}
                className="flex items-center gap-1 border border-border px-2 py-1 text-base"
              >
                {word}
                <button
                  type="button"
                  onClick={() => removeFilter(word)}
                  aria-label={`Remove ${word}`}
                  className="text-muted hover:text-foreground transition-colors"
                >
                  <X size={12} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div>
          <button
            type="button"
            onClick={handleRunRulesNow}
            disabled={runningRules || prefs.autoDeleteKeywords.length === 0}
            className="border border-border px-4 py-2 text-base hover:bg-foreground/5 transition-colors disabled:opacity-50"
          >
            {runningRules ? 'Running…' : 'Run filters now'}
          </button>
          <p className="text-base text-muted mt-1">
            Deletes any article currently in your Inbox whose title matches one of these filters.
            Save, Archive, and Read articles are left alone.
          </p>
          {rulesRunResult && <p className="text-base text-muted mt-1">{rulesRunResult}</p>}
        </div>
      </div>

      <div className="text-lg text-muted" role="status">
        {status === 'saving' && 'Saving…'}
        {status === 'saved' && 'Saved.'}
        {status === 'error' && <span className="text-danger">{error}</span>}
      </div>
    </div>
  )
}
