'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { addFeed } from '@/lib/feeds/actions'
import { ensureFolderPath, assignFeedToFolders } from '@/lib/folders/actions'

interface ParsedFeed {
  url: string
  title: string
  folderPath: string[]
}

// OPML nests feeds inside folder <outline> elements (no xmlUrl of their
// own), which can themselves nest arbitrarily deep — most readers export
// their folder structure this way, so this walk preserves the full
// ancestor path (not just the immediate parent) to rebuild real nested
// folders on import instead of flattening to one flat category as before.
function parseOpml(xml: string): ParsedFeed[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const feeds: ParsedFeed[] = []

  function walk(node: Element, path: string[]) {
    for (const child of Array.from(node.children)) {
      if (child.tagName.toLowerCase() !== 'outline') continue
      const xmlUrl = child.getAttribute('xmlUrl')
      const label = child.getAttribute('title') || child.getAttribute('text') || ''
      if (xmlUrl) {
        feeds.push({ url: xmlUrl, title: label, folderPath: path })
      } else if (label) {
        walk(child, [...path, label])
      } else {
        walk(child, path)
      }
    }
  }

  const body = doc.querySelector('body')
  if (body) walk(body, [])
  return feeds
}

export default function OpmlImport() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{
    added: number
    failed: { url: string; error: string }[]
  } | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const text = await file.text()
    const feeds = parseOpml(text)

    setImporting(true)
    setResult(null)

    // Pre-create every unique folder path found in the OPML so each feed's
    // add just looks up an already-existing leaf folder id.
    const uniquePaths = [...new Set(feeds.map((f) => f.folderPath.join('\x00')))].filter(Boolean)
    const leafIdByPath = new Map<string, string>()
    for (const key of uniquePaths) {
      const path = key.split('\x00')
      leafIdByPath.set(key, await ensureFolderPath(path))
    }

    let added = 0
    const failed: { url: string; error: string }[] = []
    for (const feed of feeds) {
      const outcome = await addFeed({ url: feed.url, title: feed.title, category: null })
      if (outcome.error !== null) {
        failed.push({ url: feed.url, error: outcome.error })
        continue
      }
      added++
      const leafId = feed.folderPath.length > 0 ? leafIdByPath.get(feed.folderPath.join('\x00')) : undefined
      if (leafId) {
        await assignFeedToFolders(outcome.feed.id, [leafId])
      }
    }

    setImporting(false)
    setResult({ added, failed })
    router.refresh()
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".opml,.xml,text/xml,text/x-opml"
        onChange={handleFile}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={importing}
        className="border border-border px-4 py-2 text-sm hover:bg-foreground/5 transition-colors disabled:opacity-50"
      >
        {importing ? 'Importing…' : 'Import OPML'}
      </button>
      {result && (
        <div className="text-xs text-muted mt-2">
          <p>
            Imported {result.added} feed{result.added === 1 ? '' : 's'}.
          </p>
          {result.failed.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {result.failed.map((f) => (
                <li key={f.url} className="text-red-600">
                  {f.url}: {f.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
