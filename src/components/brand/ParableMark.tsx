'use client'

import { useEffect, useState } from 'react'

// The Parable mark: a closed book with a bookmark ribbon, drawn in open
// strokes on the suite's 160 grid (Covenant Works Design System, Logos).
// Inline so the stroke follows currentColor: ink by default, the signature
// color only in the sidebar header (tone="accent"). Stroke thickens as the
// mark shrinks, per the spec's sizing table.
function strokeFor(size: number) {
  if (size <= 16) return 13
  if (size <= 24) return 10
  if (size <= 32) return 7
  if (size <= 48) return 6
  return 4
}

const DRAWN_KEY = 'parable-mark-drawn'

export default function ParableMark({
  size = 24,
  tone = 'ink',
  drawIn = false,
  title,
}: {
  size?: number
  tone?: 'ink' | 'accent'
  // Draws the strokes in over 720ms, once per browser session.
  drawIn?: boolean
  title?: string
}) {
  const [animate, setAnimate] = useState(false)

  useEffect(() => {
    if (!drawIn) return
    try {
      if (sessionStorage.getItem(DRAWN_KEY)) return
      sessionStorage.setItem(DRAWN_KEY, '1')
    } catch {
      return
    }
    // One-time trigger after mount: the animation must not run during SSR
    // or on later navigations in the same session.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnimate(true)
  }, [drawIn])

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 -13 160 160"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeFor(size)}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${tone === 'accent' ? 'text-accent' : 'text-foreground'} ${animate ? 'mark-draw' : ''}`}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path pathLength={1} d="M34 30 H126 V130 H34 Z" />
      <path pathLength={1} d="M56 30 V130" />
      <path pathLength={1} d="M56 30 V4" />
      <path pathLength={1} d="M56 4 L68 16 L80 4" />
    </svg>
  )
}
