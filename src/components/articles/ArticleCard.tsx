'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { saveArticle, archiveArticle, clearArticleState, deleteArticle } from '@/lib/articles/actions'
import { assignArticleToFolder, addFolder } from '@/lib/folders/actions'
import type { ArticleItem } from '@/lib/dashboard/data'
import ArticleNoteEditor from './ArticleNoteEditor'
import ArticleTagEditor from './ArticleTagEditor'

export interface FolderOption {
  id: string
  label: string
}

function formatDate(dateString: string | null): string | null {
  if (!dateString) return null
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// Shared card used by Articles/Saved/Archive pages and the dashboard's
// article-list widgets — one place for the save/archive/tag button row
// instead of duplicating it per surface. Save/Archive/Unsave always patch
// via onUpdate; the caller's list (see useOptimisticArticleList) decides
// whether the patched item still belongs in its current view and drops it
// if not, so this component doesn't need to know what view it's in.
export default function ArticleCard({
  item,
  onUpdate,
  onRemove,
  folders,
  onFolderCreated,
  showFolderPicker = false,
  showDelete = false,
  compact = false,
}: {
  item: ArticleItem
  onUpdate: (id: string, patch: Partial<ArticleItem>) => void
  onRemove: (id: string) => void
  folders?: FolderOption[]
  onFolderCreated?: (folder: FolderOption) => void
  showFolderPicker?: boolean
  showDelete?: boolean
  compact?: boolean
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addingFolder, setAddingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  async function handleSave() {
    setPending(true)
    setError(null)
    onUpdate(item.id, { state: 'saved', archivedAt: null })
    const result = await saveArticle(item.id)
    setPending(false)
    if (result.error) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  async function handleArchive() {
    setPending(true)
    setError(null)
    onUpdate(item.id, { state: 'archived', archivedAt: new Date().toISOString() })
    const result = await archiveArticle(item.id)
    setPending(false)
    if (result.error) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  async function handleUnfile() {
    setPending(true)
    setError(null)
    onUpdate(item.id, { state: null, archivedAt: null })
    const result = await clearArticleState(item.id)
    setPending(false)
    if (result.error) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  async function handleDelete() {
    setPending(true)
    setError(null)
    onRemove(item.id)
    const result = await deleteArticle(item.id)
    setPending(false)
    if (result.error) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  // Filing an article into a folder is a saved-article concept — picking
  // one from Articles/Archive implicitly saves the article too, so "save
  // directly to a folder" is one action instead of save-then-refile.
  async function handleFolderChange(folderId: string | null) {
    const shouldSave = folderId !== null && item.state !== 'saved'
    onUpdate(item.id, { folderId, ...(shouldSave ? { state: 'saved', archivedAt: null } : {}) })
    if (shouldSave) {
      const saveResult = await saveArticle(item.id)
      if (saveResult.error) {
        setError(saveResult.error)
        return
      }
    }
    const result = await assignArticleToFolder(item.id, folderId)
    if (result.error) {
      setError(result.error)
      return
    }
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
    onFolderCreated?.({ id: result.id, label: name })
    await handleFolderChange(result.id)
  }

  const showEditors = item.state === 'saved' || item.state === 'archived'

  return (
    <li className={compact ? 'border-b border-border pb-3 last:border-0 last:pb-0' : 'p-4'}>
      <div className="flex items-center gap-2 text-xs text-muted mb-0.5">
        {item.feed_title && <span className="font-medium">{item.feed_title}</span>}
        {!compact && item.category && <span>{item.category}</span>}
        {formatDate(item.published_at) && <span>{formatDate(item.published_at)}</span>}
      </div>
      <Link
        href={`/articles/${item.id}`}
        className="text-sm font-medium hover:text-accent hover:underline"
      >
        {item.title}
      </Link>
      {item.summary && <p className="text-sm text-muted mt-0.5 line-clamp-2">{item.summary}</p>}
      <div className="flex items-center gap-3 mt-1">
        {item.state === 'saved' ? (
          <button
            type="button"
            disabled={pending}
            onClick={handleUnfile}
            className="text-xs text-muted hover:text-accent transition-colors disabled:opacity-50"
          >
            Unsave
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={handleSave}
            className="text-xs text-muted hover:text-accent transition-colors disabled:opacity-50"
          >
            Save
          </button>
        )}
        {item.state === 'archived' ? (
          <button
            type="button"
            disabled={pending}
            onClick={handleUnfile}
            className="text-xs text-muted hover:text-accent transition-colors disabled:opacity-50"
          >
            Unarchive
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={handleArchive}
            className="text-xs text-muted hover:text-accent transition-colors disabled:opacity-50"
          >
            Archive
          </button>
        )}
        {showDelete && item.state === 'saved' && (
          <button
            type="button"
            disabled={pending}
            onClick={handleDelete}
            className="text-xs text-red-600 hover:text-red-800 transition-colors disabled:opacity-50"
          >
            Delete
          </button>
        )}
      </div>
      {showFolderPicker && folders && (
        <div className="flex items-center gap-1 mt-1">
          <select
            value={item.folderId ?? ''}
            onChange={(e) => handleFolderChange(e.target.value || null)}
            className="border border-border px-2 py-1 text-xs bg-background"
          >
            <option value="">No folder</option>
            {folders.map((f) => (
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
              <Plus size={14} />
            </button>
          )}
        </div>
      )}
      {showEditors && (
        <>
          <ArticleNoteEditor
            itemId={item.id}
            note={item.note}
            onChange={(note) => onUpdate(item.id, { note })}
          />
          <ArticleTagEditor
            itemId={item.id}
            tags={item.tags}
            onChange={(tags) => onUpdate(item.id, { tags })}
          />
        </>
      )}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </li>
  )
}
