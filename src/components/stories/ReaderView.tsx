'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { Story } from '@/lib/stories/data'
import Button from '@/components/ui/Button'
import SourcePicker from './SourcePicker'
import ReaderContent from './ReaderContent'

// The reader view as a wide panel over the page (full screen on phone), used
// below 1280px and for the "Across your feeds" band. At 1280px and up the
// Inbox shows the same content in its reading pane instead.
export default function ReaderView({ story, onClose }: { story: Story; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [sourceId, setSourceId] = useState(story.sources[0].id)
  const source = story.sources.find((s) => s.id === sourceId) ?? story.sources[0]

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    panelRef.current?.focus()
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center min-[640px]:items-center min-[640px]:p-4">
      <div className="cw-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`reader-${story.id}`}
        tabIndex={-1}
        style={{ width: 'min(720px, 100%)' }}
        className="cw-modal animate-overlay-in relative z-[61] flex max-h-[100dvh] flex-col focus-visible:outline-none min-[640px]:max-h-[90dvh]"
      >
        <div className="cw-modal__head flex items-start justify-between gap-3 pb-3">
          <div className="min-w-0 space-y-2">
            <p className="text-xs text-muted">{source.feedTitle}</p>
            <h2
              id={`reader-${story.id}`}
              className="break-words font-read text-[length:var(--text-2xl)] font-medium leading-[var(--leading-snug)] tracking-[var(--tracking-title)]"
            >
              {source.title}
            </h2>
            <SourcePicker sources={story.sources} value={sourceId} onChange={setSourceId} id={`reader-source-${story.id}`} />
          </div>
          <Button variant="ghost" size="sm" icon aria-label="Close reader view" title="Close" onClick={onClose}>
            <X strokeWidth={1.5} aria-hidden="true" />
          </Button>
        </div>
        <div className="cw-modal__body flex-1 overflow-y-auto border-t border-border pt-4 text-foreground">
          <div className="mx-auto max-w-[var(--read-max)]">
            <ReaderContent key={source.id} source={source} />
          </div>
        </div>
      </div>
    </div>
  )
}
