'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import type { UserPreferences } from '@/lib/preferences/data'
import { updatePreferences } from '@/lib/preferences/actions'
import { runAutoDeleteRulesNow } from '@/lib/settings/actions'
import { useToast } from '@/components/ui/Toast'
import EmptyState from '@/components/ui/EmptyState'
import Button from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export default function FiltersForm({
  initialPreferences,
  hits = {},
}: {
  initialPreferences: UserPreferences
  // Titles each word removed in the last 48 hours, keyed by the word in
  // lower case.
  hits?: Record<string, number>
}) {
  const router = useRouter()
  const toast = useToast()
  const [prefs, setPrefs] = useState(initialPreferences)
  const [filterInput, setFilterInput] = useState('')
  const [runningRules, setRunningRules] = useState(false)
  const [rulesRunResult, setRulesRunResult] = useState<string | null>(null)

  // No Save button — every control commits on change. Local state updates
  // immediately (so the control feels instant); the save + refresh happen
  // in the background after.
  async function applyChange(patch: Partial<UserPreferences>) {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    const result = await updatePreferences(patch)
    if (result.error !== null) {
      toast(result.error, 'danger')
      return
    }
    toast('Filters saved')
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
    <section className="cw-panel">
      <div className="cw-panel__head">
        <h2 className="cw-panel__title">Filtered words</h2>
      </div>
      <div className="cw-panel__body space-y-4">
        <p className="text-sm text-muted">
          New articles whose English title has one of these words or phrases are removed before they
          reach your Inbox. Whole words only: &ldquo;war&rdquo; doesn&rsquo;t catch &ldquo;award&rdquo;.
        </p>
        <div className="flex gap-2">
          <Input
            type="text"
            value={filterInput}
            onChange={(e) => setFilterInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addFilter()
              }
            }}
            placeholder="A word or phrase"
            aria-label="Word or phrase to filter"
            className="flex-1"
          />
          <Button variant="primary" onClick={addFilter}>
            Add word
          </Button>
        </div>
        {prefs.autoDeleteKeywords.length > 0 && (
          <>
            <ul className="flex flex-wrap gap-2">
              {prefs.autoDeleteKeywords.map((word) => (
                <li key={word} className="cw-badge cw-badge--plain h-7 gap-1 pr-1 text-sm">
                  {word}
                  <span className="font-mono text-2xs tabular-nums text-muted">{hits[word.toLowerCase()] ?? 0} removed</span>
                  <button
                    type="button"
                    onClick={() => removeFilter(word)}
                    aria-label={`Remove ${word}`}
                    title={`Remove ${word}`}
                    className="cw-btn cw-btn--ghost cw-btn--icon cw-btn--sm h-5 w-5"
                  >
                    <X strokeWidth={1.5} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">Removed counts cover the last 48 hours.</p>
          </>
        )}
        {prefs.autoDeleteKeywords.length === 0 && (
          <EmptyState art="filters" title="No filter words">
            A word added here removes matching titles before they reach the Inbox.
          </EmptyState>
        )}
        <div className="space-y-1 border-t border-border pt-4">
          <Button onClick={handleRunRulesNow} disabled={runningRules || prefs.autoDeleteKeywords.length === 0}>
            {runningRules ? 'Running' : 'Run filters now'}
          </Button>
          <p className="text-xs text-muted">
            Removes Inbox articles that match. Saved and archived articles are left alone.
          </p>
          {rulesRunResult && <p className="text-xs text-muted">{rulesRunResult}</p>}
        </div>
      </div>
    </section>
  )
}
