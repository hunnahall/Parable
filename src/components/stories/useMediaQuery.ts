'use client'

import { useSyncExternalStore } from 'react'

// Whether a media query matches, kept current as the window resizes. On the
// server and during hydration it's `serverValue` (false by default, so
// anything gated on it appears only once the browser confirms it).
export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => serverValue
  )
}

// The Inbox's reading pane appears from this width.
export const PANE_QUERY = '(min-width: 1280px)'
// The front page layout applies from this width.
export const FRONT_QUERY = '(min-width: 1000px)'
