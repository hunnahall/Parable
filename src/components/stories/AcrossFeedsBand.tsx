'use client'

import { useState } from 'react'
import type { Story } from '@/lib/stories/data'
import { formatAge } from '@/lib/formatting'

// A story qualifies when this many distinct feeds cover it. Tune on real
// data: with 13 feeds on 2026-10-22, one story had 2 feeds and none had 3.
const BAND_MIN_FEEDS = 3
// At most this many cards; the band hides below 2.
const BAND_MAX = 5
const BAND_MIN_STORIES = 2

const feedCount = (story: Story) => new Set(story.sources.map((s) => s.feedId)).size
const feedLabel = (story: Story) => (feedCount(story) === 1 ? '1 feed' : `${feedCount(story)} feeds`)

function bandStories(stories: Story[]): Story[] {
  return stories
    .filter((story) => feedCount(story) >= BAND_MIN_FEEDS)
    .sort(
      (a, b) =>
        feedCount(b) - feedCount(a) || new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
    )
    .slice(0, BAND_MAX)
}

// The newest https image among the story's sources.
function imageOf(story: Story): string | null {
  return story.sources.map((s) => s.imageUrl).find((url) => url?.startsWith('https://')) ?? null
}

function Thumbnail({ src, className }: { src: string | null; className: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return null
  return (
    // A plain img: no Vercel image-optimization quota, no proxy.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`border border-border bg-fill-active object-cover ${className}`}
    />
  )
}

// "Across your feeds": the stories most feeds are covering, above the
// sections on the Inbox's All view. A view, not a move: they still appear
// in their category sections. Selecting one opens the reader.
export default function AcrossFeedsBand({
  stories,
  isSeen,
  onOpen,
}: {
  stories: Story[]
  isSeen: (story: Story) => boolean
  onOpen: (story: Story) => void
}) {
  const band = bandStories(stories)
  if (band.length < BAND_MIN_STORIES) return null

  const titleClass = (story: Story) => (isSeen(story) ? 'font-normal text-foreground-muted' : 'font-semibold text-foreground')
  const meta = (story: Story) =>
    [story.sources[0].feedTitle, formatAge(story.sources[0].publishedAt ?? story.sources[0].createdAt)].filter(Boolean).join(' · ')

  return (
    <section aria-labelledby="across-feeds" className="space-y-2">
      <h2 id="across-feeds" className="cw-eyebrow">
        Across your feeds
      </h2>

      {/* Desktop and tablet: cards. */}
      <ul className="hidden gap-3 min-[640px]:grid min-[640px]:grid-cols-2 min-[1000px]:grid-cols-3">
        {band.map((story) => (
          <li key={story.id} className="flex">
            <button
              type="button"
              onClick={() => onOpen(story)}
              // .cw-panel--link sets display: block, so the column layout
              // lives on the inner span.
              className="cw-panel cw-panel--link w-full text-left"
            >
              <span className="flex h-full flex-col">
                <Thumbnail src={imageOf(story)} className="h-[140px] w-full border-x-0 border-t-0" />
                <span className="flex flex-1 flex-col gap-1.5 p-3">
                  <span className="cw-eyebrow">{feedLabel(story)}</span>
                  <span className={`font-read text-[length:var(--text-lg)] leading-snug ${titleClass(story)}`}>
                    {story.sources[0].title}
                  </span>
                  <span className="mt-auto text-xs text-muted" suppressHydrationWarning>
                    {meta(story)}
                  </span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/* Phone: the top three as compact rows. */}
      <ul className="cw-panel divide-y divide-border min-[640px]:hidden">
        {band.slice(0, 3).map((story) => (
          <li key={story.id}>
            <button type="button" onClick={() => onOpen(story)} className="flex w-full gap-3 px-4 py-3 text-left">
              <span className="min-w-0 flex-1 space-y-1">
                <span className="cw-eyebrow block">{feedLabel(story)}</span>
                <span className={`block break-words text-lg ${titleClass(story)}`}>{story.sources[0].title}</span>
                <span className="block text-xs text-muted" suppressHydrationWarning>
                  {meta(story)}
                </span>
              </span>
              <Thumbnail src={imageOf(story)} className="h-14 w-20 shrink-0" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
