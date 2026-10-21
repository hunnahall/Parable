'use client'

import { useEffect, useState } from 'react'
import type { Story } from '@/lib/stories/data'
import { markArticleRead } from '@/lib/articles/actions'
import SourcePicker from './SourcePicker'
import { useStreamedText } from './useStreamedText'

// The two-sentence summary, shown under the story when asked for. Written
// on request from the stored text and streamed in.
export default function StorySummary({ story }: { story: Story }) {
  const [sourceId, setSourceId] = useState(story.sources[0].id)
  const { text, kind, loading, error } = useStreamedText(`/api/articles/${sourceId}/summary`)

  // Asking for a summary counts as opening the article (Feeds page numbers).
  useEffect(() => {
    void markArticleRead(sourceId)
  }, [sourceId])

  return (
    <div className="mt-2 space-y-1.5 border-l-2 border-accent pl-3 text-sm">
      <SourcePicker sources={story.sources} value={sourceId} onChange={setSourceId} id={`summary-source-${story.id}`} />
      {error ? (
        <p className="text-danger">{error}</p>
      ) : text ? (
        <p className="font-read text-[length:var(--text-lg)] leading-[var(--leading-read)] text-foreground">{text}</p>
      ) : loading ? (
        <p className="text-muted">Summarizing</p>
      ) : (
        <p className="text-muted">
          {kind === 'none' ? 'No text could be fetched from the publisher, so there is nothing to summarize.' : 'No summary.'}
        </p>
      )}
      {kind === 'teaser' && text && <p className="text-xs text-muted">From the feed&rsquo;s preview only: the publisher blocks full text.</p>}
    </div>
  )
}
