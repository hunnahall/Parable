'use client'

import { useState } from 'react'
import { exportFeedsOpml } from '@/lib/feeds/actions'

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

export default function ExportFeedsButton() {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleExport() {
    setExporting(true)
    setError(null)
    const result = await exportFeedsOpml()
    setExporting(false)
    if (result.error || !result.opml) {
      setError(result.error ?? 'Export failed.')
      return
    }
    const date = new Date().toISOString().slice(0, 10)
    downloadBlob(new Blob([result.opml], { type: 'text/x-opml' }), `parable-feeds-${date}.opml`)
  }

  return (
    <div className="card-elevated p-4 space-y-2">
      <h2 className="text-sm font-medium font-heading">Export feeds</h2>
      <p className="text-xs text-muted">Download an OPML file listing all of your feeds and folders.</p>
      <button
        type="button"
        onClick={handleExport}
        disabled={exporting}
        className="border border-border px-4 py-2 text-sm hover:bg-foreground/5 transition-colors disabled:opacity-50"
      >
        {exporting ? 'Exporting…' : 'Export OPML'}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
