'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import type { ArticleItem } from '@/lib/dashboard/data'
import {
  saveArticle,
  archiveArticle,
  clearArticleState,
  markArticleRead,
} from '@/lib/articles/actions'
import { assignArticleToFolder, addFolder } from '@/lib/folders/actions'
import { getArticleContent } from '@/lib/articles/contentCache'
import ArticleNoteEditor from './ArticleNoteEditor'
import ArticleTagEditor from './ArticleTagEditor'
import ExportDialog from './ExportDialog'
import ArticleSummaryDialog from './ArticleSummaryDialog'
import type { FolderOption } from './ArticleCard'

// A sentinel folder-select value distinct from both "" (no folder) and any
// real folder id, so picking it can be told apart from an actual selection.
const NEW_FOLDER_OPTION = '__new_folder__'

function formatDate(dateString: string | null): string | null {
  if (!dateString) return null
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}

interface ContentState {
  status: 'loading' | 'ready' | 'error'
  contentHtml: string | null
  extractionError: string | null
  isTranslated: boolean
}

export default function ArticleReadingView({
  article,
  folders,
}: {
  article: ArticleItem & { originalLanguage: string | null }
  folders: FolderOption[]
}) {
  const router = useRouter()
  const [item, setItem] = useState(article)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [localFolders, setLocalFolders] = useState(folders)
  const [addingFolder, setAddingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)

  // The slow part (live scrape + translate, up to ~35s worst case) is
  // fetched here, client-side, right after mount — decoupled from the
  // page's initial render entirely, so the title/metadata/buttons above
  // are interactive immediately instead of waiting on this. See
  // /api/articles/[id]/content.
  const [content, setContent] = useState<ContentState>({
    status: 'loading',
    contentHtml: null,
    extractionError: null,
    isTranslated: false,
  })

  useEffect(() => {
    // No reset-to-loading here: the initial useState value above already
    // covers first mount, and ArticleReadingView is remounted (fresh
    // state) per article via `key={id}` in page.tsx — so this effect
    // never actually needs to re-run for a *changed* article.id on an
    // already-mounted instance.
    //
    // getArticleContent (not a raw fetch) so a request already warmed by
    // the article card's onMouseDown/onTouchStart/onFocus — see
    // src/lib/articles/contentCache.ts — is reused here instead of
    // duplicated.
    let cancelled = false
    getArticleContent(article.id)
      .then((data) => {
        if (cancelled) return
        if (data.error) {
          setContent({ status: 'error', contentHtml: null, extractionError: data.error, isTranslated: false })
          return
        }
        setContent({
          status: 'ready',
          contentHtml: data.contentHtml,
          extractionError: data.extractionError,
          isTranslated: data.isTranslated,
        })
      })
      .catch(() => {
        if (cancelled) return
        setContent({
          status: 'error',
          contentHtml: null,
          extractionError: 'Failed to load article content.',
          isTranslated: false,
        })
      })
    return () => {
      cancelled = true
    }
  }, [article.id])

  // Display-only read tracking — never touches archived_at/the 24h timer.
  useEffect(() => {
    markArticleRead(article.id)
  }, [article.id])

  async function handleArchive() {
    setPending(true)
    setError(null)
    setItem((prev) => ({
      ...prev,
      state: 'archived',
      archivedAt: new Date().toISOString(),
      folderId: null,
      tags: [],
    }))
    const result = await archiveArticle(item.id)
    setPending(false)
    if (result.error) return setError(result.error)
    router.refresh()
  }

  async function handleUnfile() {
    setPending(true)
    setError(null)
    setItem((prev) => ({ ...prev, state: null, archivedAt: null }))
    const result = await clearArticleState(item.id)
    setPending(false)
    if (result.error) return setError(result.error)
    router.refresh()
  }

  async function handleFolderChange(folderId: string | null) {
    const shouldSave = folderId !== null && item.state !== 'saved'
    setItem((prev) => ({
      ...prev,
      folderId,
      ...(shouldSave ? { state: 'saved' as const, archivedAt: null } : {}),
    }))
    if (shouldSave) {
      const saveResult = await saveArticle(item.id)
      if (saveResult.error) return setError(saveResult.error)
    }
    const result = await assignArticleToFolder(item.id, folderId)
    if (result.error) return setError(result.error)
    router.refresh()
  }

  async function handleCreateFolder() {
    const name = newFolderName.trim()
    setNewFolderName('')
    setAddingFolder(false)
    if (!name) return

    const result = await addFolder({ name, parentId: null })
    if (result.error || !result.id) {
      setError(result.error ?? 'Failed to create folder')
      return
    }
    setLocalFolders((prev) => [...prev, { id: result.id!, label: name }].sort((a, b) => a.label.localeCompare(b.label)))
    await handleFolderChange(result.id)
  }

  const showEditors = item.state === 'saved' || item.state === 'archived' || item.state === 'reading'

  return (
    <div className="max-w-2xl mx-auto p-8">
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-base text-muted hover:text-accent transition-colors mb-6"
      >
        <ArrowLeft size={14} strokeWidth={1.75} aria-hidden="true" />
        Back
      </button>

      <div className="flex items-center gap-2 text-base text-muted mb-2">
        {item.feed_title && <span className="font-medium">{item.feed_title}</span>}
        {item.category && <span>{item.category}</span>}
        {formatDate(item.published_at) && <span>{formatDate(item.published_at)}</span>}
        {content.isTranslated && (
          <span className="border border-border-subtle px-1.5 py-0.5">Translated</span>
        )}
      </div>

      {item.link ? (
        <a
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-4xl font-heading font-bold hover:text-accent hover:underline mb-4"
        >
          {item.title}
        </a>
      ) : (
        <h1 className="text-4xl font-heading font-bold mb-4">{item.title}</h1>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        {item.state === 'saved' && (
          <button
            type="button"
            disabled={pending}
            onClick={handleUnfile}
            className="text-base text-muted hover:text-accent transition-colors disabled:opacity-50"
          >
            Unsave
          </button>
        )}
        {item.state === 'archived' ? (
          <button
            type="button"
            disabled={pending}
            onClick={handleUnfile}
            className="text-base text-muted hover:text-accent transition-colors disabled:opacity-50"
          >
            Unarchive
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={handleArchive}
            className="text-base text-muted hover:text-accent transition-colors disabled:opacity-50"
          >
            Archive
          </button>
        )}
        <button
          type="button"
          disabled={!content.contentHtml}
          onClick={() => setExportOpen(true)}
          title={content.contentHtml ? undefined : 'Waiting for article content to load'}
          className="text-base text-muted hover:text-accent transition-colors disabled:opacity-50"
        >
          Export
        </button>
        <button
          type="button"
          onClick={() => setSummaryOpen(true)}
          className="text-base text-muted hover:text-accent transition-colors"
        >
          Summarize
        </button>
        {addingFolder ? (
          <input
            type="text"
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onBlur={handleCreateFolder}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                setNewFolderName('')
                setAddingFolder(false)
              }
            }}
            placeholder="New folder…"
            className="w-28 border border-border px-2 py-1 text-base bg-background"
          />
        ) : (
          <select
            value={item.folderId ?? ''}
            onChange={(e) => {
              if (e.target.value === NEW_FOLDER_OPTION) {
                setAddingFolder(true)
                return
              }
              handleFolderChange(e.target.value || null)
            }}
            className="border border-border px-2 py-1 text-base bg-background"
          >
            <option value="">No folder</option>
            {localFolders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
            <option value={NEW_FOLDER_OPTION}>+ New folder</option>
          </select>
        )}
      </div>

      {showEditors && (
        <div className="mb-6">
          <ArticleNoteEditor
            itemId={item.id}
            note={item.note}
            onChange={(note) => setItem((prev) => ({ ...prev, note }))}
          />
          <ArticleTagEditor
            itemId={item.id}
            tags={item.tags}
            onChange={(tags) =>
              setItem((prev) => {
                const shouldSave = prev.tags.length === 0 && tags.length > 0 && prev.state !== 'saved'
                return {
                  ...prev,
                  tags,
                  ...(shouldSave ? { state: 'saved' as const, archivedAt: null } : {}),
                }
              })
            }
          />
        </div>
      )}

      {error && <p className="text-lg text-danger mb-4">{error}</p>}

      <hr className="border-border-subtle mb-6" />

      {content.status === 'loading' && (
        <div className="space-y-3 animate-pulse" aria-label="Loading article content">
          <div className="h-4 w-full bg-surface-border" />
          <div className="h-4 w-full bg-surface-border" />
          <div className="h-4 w-5/6 bg-surface-border" />
          <div className="h-4 w-full bg-surface-border" />
          <div className="h-4 w-3/4 bg-surface-border" />
        </div>
      )}

      {content.status !== 'loading' && content.contentHtml && (
        <div
          className="prose-reading text-[20px] leading-relaxed [&>p]:mb-4 [&>h1]:font-heading [&>h1]:font-bold [&>h1]:text-3xl [&>h1]:mb-3 [&>h1]:mt-6 [&>h2]:font-heading [&>h2]:font-bold [&>h2]:text-2xl [&>h2]:mb-3 [&>h2]:mt-6 [&>blockquote]:border-l-2 [&>blockquote]:border-border [&>blockquote]:pl-4 [&>blockquote]:text-muted [&>ul]:list-disc [&>ul]:pl-5 [&>ol]:list-decimal [&>ol]:pl-5 [&_a]:text-accent [&_a]:hover:underline [&_img]:max-w-full"
          dangerouslySetInnerHTML={{ __html: content.contentHtml }}
        />
      )}

      {content.status !== 'loading' && !content.contentHtml && (
        <p className="text-lg text-muted">
          {content.extractionError ?? 'Content unavailable.'}{' '}
          {item.link && (
            <a href={item.link} target="_blank" rel="noopener noreferrer" className="underline">
              Read the original
            </a>
          )}
        </p>
      )}

      {exportOpen && (
        <ExportDialog
          title={item.title}
          contentHtml={content.contentHtml}
          onClose={() => setExportOpen(false)}
        />
      )}

      {summaryOpen && (
        <ArticleSummaryDialog articleId={item.id} onClose={() => setSummaryOpen(false)} />
      )}
    </div>
  )
}
