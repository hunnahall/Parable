'use client'

import { useEffect, useState } from 'react'

export interface StreamedText {
  text: string
  kind: 'full' | 'teaser' | 'none' | null
  truncated: boolean
  loading: boolean
  error: string | null
}

const LOADING: StreamedText = { text: '', kind: null, truncated: false, loading: true, error: null }

// Reads one of the on-demand routes (/api/articles/[id]/summary or
// /reader) as it streams, so the first words show while the rest is still
// being written. A new url cancels the previous read.
export function useStreamedText(url: string | null): StreamedText {
  // Keyed by url, so switching source shows a fresh loading state at once
  // instead of the previous source's text.
  const [state, setState] = useState<StreamedText & { url: string | null }>({ ...LOADING, url: null })

  useEffect(() => {
    if (!url) return
    const controller = new AbortController()
    const update = (patch: (s: StreamedText) => StreamedText) =>
      setState((prev) => ({ ...patch(prev.url === url ? prev : LOADING), url }))

    ;(async () => {
      try {
        const res = await fetch(url, { signal: controller.signal })
        if (!res.ok || !res.body) {
          update((s) => ({ ...s, loading: false, error: res.status === 404 ? 'This article is gone.' : 'Could not load it.' }))
          return
        }
        const kind = (res.headers.get('X-Text-Kind') as StreamedText['kind']) ?? null
        const truncated = res.headers.get('X-Truncated') === '1'
        update((s) => ({ ...s, kind, truncated }))

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          update((s) => ({ ...s, text: s.text + chunk }))
        }
        update((s) => ({ ...s, loading: false }))
      } catch (err) {
        if (controller.signal.aborted) return
        console.error('useStreamedText', err)
        update((s) => ({ ...s, loading: false, error: 'Could not load it.' }))
      }
    })()

    return () => controller.abort()
  }, [url])

  if (state.url !== url) return LOADING
  return state
}
