'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus } from 'lucide-react'
import type { ArticleItem } from '@/lib/dashboard/data'
import {
  saveArticle,
  archiveArticle,
  clearArticleState,
  markArticleRead,
} from '@/lib/articles/actions'
import { assignArticleToFolder, addFolder } from '@/lib/folders/actions'
import ArticleNoteEditor from './ArticleNoteEditor'
import ArticleTagEditor from './ArticleTagEditor'
import ExportDialog from './ExportDialog'
import type { FolderOption } from './ArticleCard'

function formatDate(dateString: string | null): string | null {
  if (!dateString) return null
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}

export default function ArticleReadingView({
  article,
  contentHtml,
  extractionError,
  isTranslated,
  folders,
}: {
  article: ArticleItem & { originalLanguage: string | null }
  contentHtml: string | null
  extractionError: string | null
  isTranslated: boolean
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

  // Display-only read tracking — never touches archived_at/the 48h timer.
  useEffect(() => {
    markArticleRead(article.id)
  }, [article.id])

  async function handleSave() {
    setPending(true)
    setError(null)
    setItem((prev) => ({ ...prev, state: 'saved', archivedAt: null }))
    const result = await saveArticle(item.id)
    setPending(false)
    if (result.error) return setError(result.error)
    router.refresh()
  }

  async function handleArchive() {
    setPending(true)
    setError(null)
    setItem((prev) => ({ ...prev, state: 'archived', archivedAt: new Date().toISOString() }))
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

  const showEditors = item.state === 'saved' || item.state === 'archived'

  return (
    <div className="max-w-2xl mx-auto p-8">
      <Link
        href="/articles"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-accent transition-colors mb-6"
      >
        <ArrowLeft size={14} strokeWidth={1.75} aria-hidden="true" />
        Back to Articles
      </Link>

      <div className="flex items-center gap-2 text-xs text-muted mb-2">
        {item.feed_title && <span className="font-medium">{item.feed_title}</span>}
        {item.category && <span>{item.category}</span>}
        {formatDate(item.published_at) && <span>{formatDate(item.published_at)}</span>}
        {isTranslated && (
          <span className="border border-border-subtle px-1.5 py-0.5">Translated</span>
        )}
      </div>

      {item.link ? (
        <a
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-2xl font-heading font-bold hover:text-accent hover:underline mb-4"
        >
          {item.title}
        </a>
      ) : (
        <h1 className="text-2xl font-heading font-bold mb-4">{item.title}</h1>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        {item.state === 'saved' ? (
          <button
            type="button"
            disabled={pending}
            onClick={handleUnfile}
            className="text-sm text-muted hover:text-accent transition-colors disabled:opacity-50"
          >
            Unsave
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={handleSave}
            className="text-sm text-muted hover:text-accent transition-colors disabled:opacity-50"
          >
            Save
          </button>
        )}
        {item.state === 'archived' ? (
          <button
            type="button"
            disabled={pending}
            onClick={handleUnfile}
            className="text-sm text-muted hover:text-accent transition-colors disabled:opacity-50"
          >
            Unarchive
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={handleArchive}
            className="text-sm text-muted hover:text-accent transition-colors disabled:opacity-50"
          >
            Archive
          </button>
        )}
        <button
          type="button"
          onClick={() => setExportOpen(true)}
          className="text-sm text-muted hover:text-accent transition-colors"
        >
          Export
        </button>
      </div>

      <div className="flex items-center gap-1 mb-2">
        <select
          value={item.folderId ?? ''}
          onChange={(e) => handleFolderChange(e.target.value || null)}
          className="border border-border px-2 py-1 text-xs bg-background"
        >
          <option value="">No folder</option>
          {localFolders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
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
            className="w-28 border border-border px-2 py-1 text-xs bg-background"
          />
        ) : (
          <button
            type="button"
            onClick={() => setAddingFolder(true)}
            aria-label="Add folder"
            title="Add folder"
            className="text-muted hover:text-accent transition-colors"
          >
            <Plus size={14} strokeWidth={1.75} />
          </button>
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
            onChange={(tags) => setItem((prev) => ({ ...prev, tags }))}
          />
        </div>
      )}

      {error && <p className="text-sm text-danger mb-4">{error}</p>}

      <hr className="border-border-subtle mb-6" />

      {contentHtml ? (
        <div
          className="prose-reading text-[17px] leading-relaxed [&>p]:mb-4 [&>h1]:font-heading [&>h1]:font-bold [&>h1]:text-xl [&>h1]:mb-3 [&>h1]:mt-6 [&>h2]:font-heading [&>h2]:font-bold [&>h2]:text-lg [&>h2]:mb-3 [&>h2]:mt-6 [&>blockquote]:border-l-2 [&>blockquote]:border-border [&>blockquote]:pl-4 [&>blockquote]:text-muted [&>ul]:list-disc [&>ul]:pl-5 [&>ol]:list-decimal [&>ol]:pl-5 [&_a]:text-accent [&_a]:hover:underline [&_img]:max-w-full"
          dangerouslySetInnerHTML={{ __html: contentHtml }}
        />
      ) : (
        <p className="text-sm text-muted">
          {extractionError ?? 'Content unavailable.'}{' '}
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
          contentHtml={contentHtml}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  )
}
