'use client'

import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { previewBuiltFeed, createBuiltFeed } from '@/lib/feeds/actions'
import type { BuildFeedPreview } from '@/lib/feeds/buildFeed'
import type { FeedRow } from '@/lib/feeds/data'

const NO_FOLDER = 'No folder'
const PREVIEW_ITEM_LIMIT = 10

type Step = 'url' | 'preview'

export default function BuildFeedSection({
  folders,
  onCreated,
}: {
  folders: { id: string; label: string }[]
  onCreated: (feed: FeedRow, folderIds: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('url')
  const [url, setUrl] = useState('')
  const [detecting, setDetecting] = useState(false)
  const [preview, setPreview] = useState<BuildFeedPreview | null>(null)
  const [title, setTitle] = useState('')
  const [folderId, setFolderId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const busy = detecting || saving

  const close = useCallback(() => {
    if (busy) return
    setOpen(false)
    setStep('url')
    setUrl('')
    setPreview(null)
    setTitle('')
    setFolderId('')
    setError(null)
  }, [busy])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, close])

  async function handleDetect(e: React.FormEvent) {
    e.preventDefault()
    setDetecting(true)
    setError(null)
    const result = await previewBuiltFeed(url)
    setDetecting(false)
    if (result.error !== null) {
      setError(result.error)
      return
    }
    setPreview(result.preview)
    setTitle(result.preview.pageTitle ?? '')
    setStep('preview')
  }

  async function handleCreate() {
    if (!preview) return
    setSaving(true)
    setError(null)
    const result = await createBuiltFeed({
      sourceUrl: preview.sourceUrl,
      title: title.trim(),
    })
    setSaving(false)
    if (result.error !== null) {
      setError(result.error)
      return
    }
    onCreated(result.feed, folderId ? [folderId] : [])
    close()
  }

  return (
    <>
      <div className="card-elevated p-4 space-y-2">
        <h2 className="text-lg font-bold">Build a Feed</h2>
        <p className="text-base text-muted">
          Parable can detect articles in websites that don&rsquo;t offer RSS feeds.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="bg-foreground text-background px-4 py-2 text-base transition-colors hover:opacity-90"
        >
          Build feed
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-foreground/40 transition-opacity duration-[var(--motion-standard)]"
            onClick={close}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Build a Feed"
            className="card-modal absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg p-5 max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Build a Feed</h2>
              <button
                type="button"
                onClick={close}
                disabled={busy}
                aria-label="Close"
                className="text-muted hover:text-foreground transition-colors disabled:opacity-50"
              >
                <X size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>

            {step === 'url' && (
              <form onSubmit={handleDetect} className="space-y-3">
                <p className="text-base text-muted">
                  Enter the URL of a page that lists articles — a blog index, a news section, and
                  so on. Parable will try to detect the repeating article pattern from its HTML.
                </p>
                <input
                  type="url"
                  required
                  autoFocus
                  placeholder="https://example.com/news"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full border border-border px-3 py-2 text-lg bg-background"
                />
                {error && <p className="text-base text-danger">{error}</p>}
                <button
                  type="submit"
                  disabled={detecting}
                  className="w-full bg-foreground text-background px-4 py-2 text-base font-semibold transition-colors hover:opacity-90 disabled:opacity-50"
                >
                  {detecting ? 'Detecting…' : 'Detect articles'}
                </button>
              </form>
            )}

            {step === 'preview' && preview && (
              <div className="space-y-3">
                <p className="text-base text-muted">
                  Found {preview.articles.length} article{preview.articles.length === 1 ? '' : 's'}{' '}
                  on <span className="font-medium break-all">{preview.sourceUrl}</span>.
                </p>

                <div>
                  <label className="block text-sm text-muted mb-1">Feed title</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full border border-border px-3 py-2 text-lg bg-background"
                  />
                </div>

                <div>
                  <label className="block text-sm text-muted mb-1">Folder</label>
                  <select
                    value={folderId}
                    onChange={(e) => setFolderId(e.target.value)}
                    className="w-full border border-border px-3 py-2 text-lg bg-background"
                  >
                    <option value="">{NO_FOLDER}</option>
                    {folders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.label}
                      </option>
                    ))}
                  </select>
                </div>

                <ul className="border border-border divide-y divide-border max-h-64 overflow-y-auto">
                  {preview.articles.slice(0, PREVIEW_ITEM_LIMIT).map((article) => (
                    <li key={article.link} className="p-2.5 flex gap-2.5">
                      {article.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element -- external, arbitrary-domain thumbnail from the scraped page
                        <img
                          src={article.imageUrl}
                          alt=""
                          className="w-12 h-12 object-cover shrink-0 bg-foreground/5"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="text-base font-medium truncate">{article.title}</p>
                        {article.snippet && (
                          <p className="text-base text-muted line-clamp-2">{article.snippet}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                {preview.articles.length > PREVIEW_ITEM_LIMIT && (
                  <p className="text-base text-muted">
                    +{preview.articles.length - PREVIEW_ITEM_LIMIT} more not shown.
                  </p>
                )}

                {error && <p className="text-base text-danger">{error}</p>}

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={saving || !title.trim()}
                    className="flex-1 bg-foreground text-background px-4 py-2 text-base font-semibold transition-colors hover:opacity-90 disabled:opacity-50"
                  >
                    {saving ? 'Adding…' : 'Add feed'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('url')
                      setPreview(null)
                      setError(null)
                    }}
                    disabled={saving}
                    className="text-base text-muted hover:text-accent transition-colors disabled:opacity-50"
                  >
                    Try a different URL
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
