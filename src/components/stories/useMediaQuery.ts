'use client'

import { useSyncExternalStore } from 'react'

// Whether a media query matches, kept current as the window resizes. False
// on the server and during hydration, so anything gated on it appears only
// once the browser confirms it.
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false
  )
}

// The Inbox's reading pane appears from this width.
export const PANE_QUERY = '(min-width: 1280px)'
