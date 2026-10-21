'use client'

import { useEffect } from 'react'
import { ExternalLink } from 'lucide-react'
import type { StorySource } from '@/lib/stories/data'
import { markArticleRead } from '@/lib/articles/actions'
import { useStreamedText } from './useStreamedText'

// One source's text in English, shared by the reader modal and the Inbox's
// reading pane. Translated on request from the stored text and streamed in;
// English articles show as stored. When only a teaser or nothing could be
// fetched, it says so and points to the publisher. Opening it counts as
// opening the article (Feeds page numbers).
export default function ReaderContent({ source }: { source: StorySource }) {
  const { text, kind, truncated, loading, error } = useStreamedText(`/api/articles/${source.id}/reader`)

  useEffect(() => {
    void markArticleRead(source.id)
  }, [source.id])

  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const publisherLink = source.link && (
    <a
      href={source.link}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
    >
      Read it on {source.feedTitle ?? 'the publisher’s site'}
      <ExternalLink size={14} strokeWidth={1.5} aria-hidden="true" />
    </a>
  )

  if (error) return <p className="text-danger">{error}</p>
  if (kind === 'none' && !loading) {
    return (
      <p>
        Parable couldn&rsquo;t fetch this article&rsquo;s text (the publisher blocks it or it&rsquo;s behind a paywall).{' '}
        {publisherLink}
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {kind === 'teaser' && (
        <p className="text-sm text-muted">
          Only the feed&rsquo;s preview could be fetched: the publisher blocks full text or it&rsquo;s behind a paywall.{' '}
          {publisherLink}
        </p>
      )}
      {paragraphs.length === 0 && loading && <p className="text-muted">Loading</p>}
      {paragraphs.map((p, i) => (
        <p key={i} className="font-read text-[length:var(--text-lg)] leading-[var(--leading-read)]">
          {p}
        </p>
      ))}
      {!loading && kind !== 'teaser' && (
        <p className="border-t border-border pt-3 text-sm text-muted">
          {truncated ? 'This is the first part of a long article. ' : ''}
          {publisherLink}
        </p>
      )}
    </div>
  )
}
