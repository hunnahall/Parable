'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { addFeed, exportFeedsOpml } from '@/lib/feeds/actions'
import { ensureFolderPath, assignFeedToFolders } from '@/lib/folders/actions'
import CleanSlateDialog from './CleanSlateDialog'
import RulebookDialog from './RulebookDialog'

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

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// The settings-page actions, on one row. They share this component rather
// than a card each because their results (an import report, an export
// error) belong under the row as a whole — inside a flex item they would
// stretch one button away from its neighbours.
export default function SettingsActions() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{
    added: number
    failed: { url: string; error: string }[]
  } | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [cleanSlateOpen, setCleanSlateOpen] = useState(false)
  const [rulebookOpen, setRulebookOpen] = useState(false)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const text = await file.text()
    const feeds = parseOpml(text)

    setImporting(true)
    setImportResult(null)

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
      const outcome = await addFeed({ url: feed.url, title: feed.title })
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
    setImportResult({ added, failed })
    router.refresh()
  }

  async function handleExport() {
    setExporting(true)
    setExportError(null)
    const result = await exportFeedsOpml()
    setExporting(false)
    if (result.error || !result.opml) {
      setExportError(result.error ?? 'Export failed.')
      return
    }
    const date = new Date().toISOString().slice(0, 10)
    downloadBlob(new Blob([result.opml], { type: 'text/x-opml' }), `parable-feeds-${date}.opml`)
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept=".opml,.xml,text/xml,text/x-opml"
        onChange={handleFile}
        className="hidden"
      />
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setRulebookOpen(true)}
          className="border border-border px-4 py-2 text-base hover:bg-foreground/5 transition-colors"
        >
          Help
        </button>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={importing}
          className="border border-border px-4 py-2 text-base hover:bg-foreground/5 transition-colors disabled:opacity-50"
        >
          {importing ? 'Importing…' : 'Import OPML'}
        </button>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="border border-border px-4 py-2 text-base hover:bg-foreground/5 transition-colors disabled:opacity-50"
        >
          {exporting ? 'Exporting…' : 'Export OPML'}
        </button>
        <button
          type="button"
          onClick={() => setCleanSlateOpen(true)}
          className="border border-danger text-danger px-4 py-2 text-base hover:bg-danger/10 transition-colors"
        >
          Clean slate
        </button>
      </div>

      {importResult && (
        <div className="text-base text-muted">
          <p>
            Imported {importResult.added} feed{importResult.added === 1 ? '' : 's'}.
          </p>
          {importResult.failed.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {importResult.failed.map((f) => (
                <li key={f.url} className="text-danger">
                  {f.url}: {f.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {exportError && <p className="text-base text-danger">{exportError}</p>}

      {rulebookOpen && <RulebookDialog onClose={() => setRulebookOpen(false)} />}
      {cleanSlateOpen && <CleanSlateDialog onClose={() => setCleanSlateOpen(false)} />}
    </div>
  )
}
