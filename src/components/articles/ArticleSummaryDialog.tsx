'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

interface SummaryState {
  status: 'loading' | 'ready' | 'error'
  summary: string | null
  error: string | null
}

export default function ArticleSummaryDialog({
  articleId,
  onClose,
}: {
  articleId: string
  onClose: () => void
}) {
  const [state, setState] = useState<SummaryState>({ status: 'loading', summary: null, error: null })

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/articles/${articleId}/summarize`, { method: 'POST' })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        if (data.error) {
          setState({ status: 'error', summary: null, error: data.error })
          return
        }
        setState({ status: 'ready', summary: data.summary, error: null })
      })
      .catch(() => {
        if (cancelled) return
        setState({ status: 'error', summary: null, error: 'Failed to generate summary.' })
      })
    return () => {
      cancelled = true
    }
  }, [articleId])

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
        aria-label="Article summary"
        className="card-modal absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Summary</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted hover:text-foreground transition-colors"
          >
            <X size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        {state.status === 'loading' && (
          <div className="space-y-2 animate-pulse" aria-label="Generating summary">
            <div className="h-3 w-full bg-surface-border" />
            <div className="h-3 w-full bg-surface-border" />
            <div className="h-3 w-3/4 bg-surface-border" />
          </div>
        )}

        {state.status === 'error' && <p className="text-base text-danger">{state.error}</p>}

        {state.status === 'ready' && <p className="text-lg leading-relaxed">{state.summary}</p>}
      </div>
    </div>
  )
}
