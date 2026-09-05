'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  archiveArticle,
  clearArticleState,
  deleteArticle,
  markArticleRead,
} from '@/lib/articles/actions'
import { setArticleFolders, addFolder } from '@/lib/folders/actions'
import type { ArticleItem } from '@/lib/articles/list'
import type { FolderOption } from './ArticleCard'

// Shared archive/delete/folder-assignment logic behind ArticleCard (list
// row) and ArticleCardGrid (card tile) — same handlers, same
// optimistic-update contract, so the two layouts can't drift apart on
// what these actions actually do. There's no standalone save action:
// handleFoldersChange below is what saves an article.
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

  async function handleArchive() {
    setPending(true)
    setError(null)
    onUpdate(item.id, { state: 'archived', archivedAt: new Date().toISOString(), folderIds: [] })
    const result = await archiveArticle(item.id)
    setPending(false)
    if (result.error) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  // Clicking a title opens the publisher's own page — Parable never
  // stores the body, so there's nowhere else to go. Read tracking is
  // fire-and-forget: it feeds the Feeds page's engagement rate and nothing
  // that blocks the click.
  function handleOpen() {
    void markArticleRead(item.id)
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

  // Filing an article is what saves it, so picking a folder from the Inbox
  // is one action rather than save-then-refile. setArticleFolders performs
  // the same promotion server-side; the optimistic patch here just keeps
  // the card from flickering while that round trip completes.
  async function handleFoldersChange(folderIds: string[]) {
    const shouldSave = folderIds.length > 0 && item.state !== 'saved'
    onUpdate(item.id, { folderIds, ...(shouldSave ? { state: 'saved', archivedAt: null } : {}) })
    const result = await setArticleFolders(item.id, folderIds)
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
    await handleFoldersChange([...item.folderIds, result.id])
  }

  return {
    pending,
    error,
    addingFolder,
    setAddingFolder,
    newFolderName,
    setNewFolderName,
    handleArchive,
    handleOpen,
    handleUnfile,
    handleDelete,
    handleFoldersChange,
    handleCreateFolder,
  }
}
