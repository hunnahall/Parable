'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveArticle, archiveArticle, clearArticleState, deleteArticle } from '@/lib/articles/actions'
import { assignArticleToFolder, addFolder } from '@/lib/folders/actions'
import type { ArticleItem } from '@/lib/dashboard/data'
import type { FolderOption } from './ArticleCard'

// Shared save/archive/delete/folder-assignment logic behind ArticleCard
// (list row) and ArticleCardGrid (card tile) — same handlers, same
// optimistic-update contract, so the two layouts can't drift apart on
// what these actions actually do.
export function useArticleCardActions({
  item,
  onUpdate,
  onRemove,
  onFolderCreated,
}: {
  item: ArticleItem
  onUpdate: (id: string, patch: Partial<ArticleItem>) => void
  onRemove: (id: string) => void
  onFolderCreated?: (folder: FolderOption) => void
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

  return {
    pending,
    error,
    addingFolder,
    setAddingFolder,
    newFolderName,
    setNewFolderName,
    handleSave,
    handleArchive,
    handleUnfile,
    handleDelete,
    handleFolderChange,
    handleCreateFolder,
  }
}
