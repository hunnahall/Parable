'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { performFullReset, performPartialReset } from '@/lib/settings/actions'

const CONFIRM_PHRASE = 'RESET'

type ResetMode = 'full' | 'partial'

export default function CleanSlateDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [mode, setMode] = useState<ResetMode>('partial')
  const [confirmText, setConfirmText] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !pending) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose, pending])

  const canConfirm = mode === 'partial' || confirmText.trim().toUpperCase() === CONFIRM_PHRASE

  async function handleConfirm() {
    setPending(true)
    setError(null)

    if (mode === 'full') {
      const result = await performFullReset()
      if (result.error) {
        setPending(false)
        setError(result.error)
        return
      }
      // Preferences (theme/font) just changed along with everything else —
      // router.refresh() re-renders the Server Component layout that reads
      // them (see SettingsForm's applyChange, which relies on the same
      // thing for a theme change alone), and push takes them somewhere
      // that isn't the now-empty settings state.
      router.push('/')
      router.refresh()
      return
    }

    const result = await performPartialReset()
    if (result.error) {
      setPending(false)
      setError(result.error)
      return
    }
    router.push('/articles')
    router.refresh()
  }

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-foreground/40 transition-opacity duration-[var(--motion-standard)]"
        onClick={() => !pending && onClose()}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Clean slate"
        className="card-modal absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold">Clean slate</h2>
          <button
            type="button"
            onClick={() => !pending && onClose()}
            aria-label="Close"
            className="text-muted hover:text-foreground transition-colors"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-2 mb-4">
          <label className="flex items-start gap-2 border border-border p-3 cursor-pointer has-[:checked]:border-accent">
            <input
              type="radio"
              name="resetMode"
              className="mt-0.5"
              checked={mode === 'partial'}
              onChange={() => {
                setMode('partial')
                setConfirmText('')
              }}
            />
            <span>
              <span className="block text-sm font-medium">Partial reset — inbox to zero</span>
              <span className="block text-xs text-muted mt-0.5">
                Archives every unread article in your Articles inbox, as if you&rsquo;d gone through
                and dismissed each one. Feeds, saved articles, tags, notes, and read history are
                untouched.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2 border border-border p-3 cursor-pointer has-[:checked]:border-danger">
            <input
              type="radio"
              name="resetMode"
              className="mt-0.5"
              checked={mode === 'full'}
              onChange={() => setMode('full')}
            />
            <span>
              <span className="block text-sm font-medium">Full reset</span>
              <span className="block text-xs text-muted mt-0.5">
                Permanently deletes everything — every feed, article, saved item, tag, note, and
                folder, plus your display preferences, dashboard layout, key dates, and tasks. Your
                account goes back to exactly how it looked right after signup. This can&rsquo;t be
                undone.
              </span>
            </span>
          </label>
        </div>

        {mode === 'full' && (
          <div className="mb-4">
            <label className="block text-xs text-muted mb-1">
              Type <span className="font-mono font-semibold">{CONFIRM_PHRASE}</span> to confirm
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full border border-border px-2 py-1.5 text-sm bg-background"
              autoComplete="off"
            />
          </div>
        )}

        {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

        <button
          type="button"
          onClick={handleConfirm}
          disabled={pending || !canConfirm}
          className={
            mode === 'full'
              ? 'w-full border border-danger bg-danger text-danger-foreground px-4 py-2 text-sm font-semibold transition-colors hover:opacity-90 disabled:opacity-50'
              : 'w-full border border-brand bg-brand text-brand-foreground px-4 py-2 text-sm font-semibold transition-colors hover:opacity-90 disabled:opacity-50'
          }
        >
          {pending
            ? 'Working…'
            : mode === 'full'
              ? 'Permanently delete everything'
              : 'Archive my inbox'}
        </button>
      </div>
    </div>
  )
}
