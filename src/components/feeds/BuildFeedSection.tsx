'use client'

import { useCallback, useState } from 'react'
import { previewBuiltFeed, createBuiltFeed } from '@/lib/feeds/actions'
import type { BuildFeedPreview } from '@/lib/feeds/buildFeed'
import type { FeedRow } from '@/lib/feeds/data'
import type { CategoryRow } from '@/lib/categories/data'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { Field, Input, Select } from '@/components/ui/Input'

const NO_CATEGORY = 'No category'
const PREVIEW_ITEM_LIMIT = 10

type Step = 'url' | 'preview'

export default function BuildFeedSection({
  categories,
  onCreated,
}: {
  categories: CategoryRow[]
  onCreated: (feed: FeedRow) => void
}) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('url')
  const [url, setUrl] = useState('')
  const [detecting, setDetecting] = useState(false)
  const [preview, setPreview] = useState<BuildFeedPreview | null>(null)
  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState('')
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
    setCategoryId('')
    setError(null)
  }, [busy])

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
      categoryId: categoryId || null,
    })
    setSaving(false)
    if (result.error !== null) {
      setError(result.error)
      return
    }
    onCreated(result.feed)
    close()
  }

  return (
    <>
      <section className="cw-panel">
        <div className="cw-panel__head">
          <h2 className="cw-panel__title">Build a feed</h2>
          <Button size="sm" onClick={() => setOpen(true)}>
            Build a feed
          </Button>
        </div>
        <p className="cw-panel__body text-sm text-muted">
          For sites with no RSS: Parable reads a page&rsquo;s list of articles and checks it on every run.
        </p>
      </section>

      <Modal
        open={open}
        onClose={close}
        title={step === 'url' ? 'Which page lists the articles?' : 'Add this feed?'}
      >
        {step === 'url' && (
          <form onSubmit={handleDetect} className="space-y-4">
            <p>A blog index or a news section works. Parable looks for the repeating article pattern.</p>
            <Field label="Page URL" htmlFor="build-feed-url" error={error}>
              <Input
                id="build-feed-url"
                type="url"
                required
                autoFocus
                placeholder="https://example.com/news"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={detecting}>
                {detecting ? 'Detecting' : 'Detect articles'}
              </Button>
            </div>
          </form>
        )}

        {step === 'preview' && preview && (
          <div className="space-y-4">
            <p>
              Found {preview.articles.length} article{preview.articles.length === 1 ? '' : 's'} on{' '}
              <span className="break-all text-foreground">{preview.sourceUrl}</span>.
            </p>

            <Field label="Feed title" htmlFor="build-feed-title">
              <Input id="build-feed-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>

            <Field label="Category" htmlFor="build-feed-category">
              <Select id="build-feed-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">{NO_CATEGORY}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>

            <ul className="max-h-64 divide-y divide-border overflow-y-auto border border-border">
              {preview.articles.slice(0, PREVIEW_ITEM_LIMIT).map((article) => (
                <li key={article.link} className="flex gap-3 p-3">
                  {article.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- external, arbitrary-domain thumbnail from the scraped page
                    <img src={article.imageUrl} alt="" className="h-12 w-12 shrink-0 bg-fill-active object-cover" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{article.title}</p>
                    {article.snippet && <p className="line-clamp-2 text-xs text-muted">{article.snippet}</p>}
                  </div>
                </li>
              ))}
            </ul>
            {preview.articles.length > PREVIEW_ITEM_LIMIT && (
              <p className="text-xs text-muted">{preview.articles.length - PREVIEW_ITEM_LIMIT} more not shown</p>
            )}

            {error && <p className="cw-error">{error}</p>}

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setStep('url')
                  setPreview(null)
                  setError(null)
                }}
                disabled={saving}
              >
                Try another page
              </Button>
              <Button variant="primary" onClick={handleCreate} disabled={saving || !title.trim()}>
                {saving ? 'Adding' : 'Add feed'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
