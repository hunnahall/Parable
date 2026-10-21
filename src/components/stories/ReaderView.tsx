'use client'

import { useEffect, useRef, useState } from 'react'
import { ExternalLink, X } from 'lucide-react'
import type { Story } from '@/lib/stories/data'
import { markArticleRead } from '@/lib/articles/actions'
import Button from '@/components/ui/Button'
import SourcePicker from './SourcePicker'
import { useStreamedText } from './useStreamedText'

// The article's own text in English, in a wide panel over the page (full
// screen on phone). Translated on request from the stored text and
// streamed in; English articles show as stored. When only a teaser or
// nothing could be fetched, it says so and points to the publisher.
export default function ReaderView({ story, onClose }: { story: Story; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [sourceId, setSourceId] = useState(story.sources[0].id)
  const source = story.sources.find((s) => s.id === sourceId) ?? story.sources[0]
  const { text, kind, truncated, loading, error } = useStreamedText(`/api/articles/${sourceId}/reader`)

  useEffect(() => {
    void markArticleRead(sourceId)
  }, [sourceId])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    panelRef.current?.focus()
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const publisherLink = source.link && (
    <a href={source.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
      Read it on {source.feedTitle ?? 'the publisher’s site'}
      <ExternalLink size={14} strokeWidth={1.5} aria-hidden="true" />
    </a>
  )

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
            <h2 id={`reader-${story.id}`} className="cw-modal__title break-words">
              {source.title}
            </h2>
            <SourcePicker sources={story.sources} value={sourceId} onChange={setSourceId} id={`reader-source-${story.id}`} />
          </div>
          <Button variant="ghost" size="sm" icon aria-label="Close reader view" title="Close" onClick={onClose}>
            <X strokeWidth={1.5} aria-hidden="true" />
          </Button>
        </div>
        <div className="cw-modal__body flex-1 space-y-4 overflow-y-auto border-t border-border pt-4 text-foreground">
          {error ? (
            <p className="text-danger">{error}</p>
          ) : kind === 'none' && !loading ? (
            <p>Parable couldn&rsquo;t fetch this article&rsquo;s text (the publisher blocks it or it&rsquo;s behind a paywall). {publisherLink}</p>
          ) : (
            <>
              {kind === 'teaser' && (
                <p className="text-sm text-muted">Only the feed&rsquo;s preview could be fetched: the publisher blocks full text or it&rsquo;s behind a paywall. {publisherLink}</p>
              )}
              {paragraphs.length === 0 && loading && <p className="text-muted">Loading</p>}
              {paragraphs.map((p, i) => (
                <p key={i} className="leading-relaxed">
                  {p}
                </p>
              ))}
              {!loading && kind !== 'teaser' && (
                <p className="border-t border-border pt-3 text-sm text-muted">
                  {truncated ? 'This is the first part of a long article. ' : ''}
                  {publisherLink}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
