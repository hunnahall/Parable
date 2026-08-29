'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { exportAsMarkdown, exportAsPdf } from '@/lib/articles/export'

function sanitizeFilename(title: string): string {
  return title.replace(/[/\\?%*:|"<>]/g, '').trim().slice(0, 80) || 'article'
}

export default function ExportDialog({
  title,
  contentHtml,
  onClose,
}: {
  title: string
  contentHtml: string | null
  onClose: () => void
}) {
  const [filetype, setFiletype] = useState<'pdf' | 'markdown'>('pdf')
  const [filename, setFilename] = useState(sanitizeFilename(title))
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  async function handleDownload() {
    if (!contentHtml) {
      setError('No content available to export.')
      return
    }
    setExporting(true)
    setError(null)
    try {
      if (filetype === 'markdown') {
        exportAsMarkdown(title, contentHtml, `${filename}.md`)
      } else {
        await exportAsPdf(title, contentHtml, `${filename}.pdf`)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-foreground/40 transition-opacity duration-[var(--motion-standard)]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Export article"
        className="card-modal absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Export article</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted hover:text-foreground transition-colors"
          >
            <X size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        <div className="flex items-center gap-4 mb-3 text-lg">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="filetype"
              checked={filetype === 'pdf'}
              onChange={() => setFiletype('pdf')}
            />
            PDF
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="filetype"
              checked={filetype === 'markdown'}
              onChange={() => setFiletype('markdown')}
            />
            Markdown
          </label>
        </div>

        <label className="block text-sm text-muted mb-1">Filename</label>
        <div className="flex items-center gap-1 mb-4">
          <input
            type="text"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            className="flex-1 border border-border px-2 py-1.5 text-lg bg-background"
          />
          <span className="text-lg text-muted">.{filetype === 'pdf' ? 'pdf' : 'md'}</span>
        </div>

        {error && <p className="text-base text-danger mb-3">{error}</p>}

        <button
          type="button"
          onClick={handleDownload}
          disabled={exporting || !filename.trim()}
          className="w-full border border-brand bg-brand text-brand-foreground px-4 py-2 text-base font-semibold transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {exporting ? 'Exporting…' : 'Download'}
        </button>
      </div>
    </div>
  )
}
