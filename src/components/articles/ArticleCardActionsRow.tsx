'use client'

import { Archive, ArchiveRestore, Bookmark, Trash2 } from 'lucide-react'
import type { ArticleItem } from '@/lib/articles/list'
import type { FolderOption } from './ArticleCard'
import type { useArticleCardActions } from './useArticleCardActions'
import ArticleFolderPicker from './ArticleFolderPicker'

// Archive/Delete and folder filing on one row. Shared between ArticleCard
// (list) and ArticleCardGrid (card) so the two layouts can't drift. There
// is no standalone Save action — filing an article into a folder is what
// saves it (see handleFoldersChange in useArticleCardActions).
//
// On a list row the whole row is a hover group, so these stay out of the
// way until the pointer is on the article they belong to. Keyboard focus
// reveals them too (focus-within), and coarse pointers get them
// unconditionally since there is no hover state to reveal them with.
export default function ArticleCardActionsRow({
  item,
  actions,
  folders,
  showFolderPicker = false,
  showDelete = false,
  alwaysVisible = false,
}: {
  item: ArticleItem
  actions: ReturnType<typeof useArticleCardActions>
  folders?: FolderOption[]
  showFolderPicker?: boolean
  showDelete?: boolean
  // Card tiles have no row to hover, so they opt out of the reveal.
  alwaysVisible?: boolean
}) {
  const {
    pending,
    addingFolder,
    setAddingFolder,
    newFolderName,
    setNewFolderName,
    handleArchive,
    handleUnfile,
    handleDelete,
    handleFoldersChange,
    handleCreateFolder,
  } = actions

  const iconButton =
    'inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-sm transition-colors disabled:opacity-50'

  return (
    <div
      className={
        'mt-1.5 flex flex-wrap items-center gap-1 transition-opacity duration-[var(--motion-fast)] ' +
        (alwaysVisible
          ? ''
          : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100')
      }
    >
      {showFolderPicker && folders && (
        <ArticleFolderPicker
          selectedIds={item.folderIds}
          folders={folders}
          onChange={handleFoldersChange}
          addingFolder={addingFolder}
          setAddingFolder={setAddingFolder}
          newFolderName={newFolderName}
          setNewFolderName={setNewFolderName}
          onCreateFolder={handleCreateFolder}
          disabled={pending}
        />
      )}

      {item.state === 'saved' && (
        <button
          type="button"
          disabled={pending}
          onClick={handleUnfile}
          className={`${iconButton} text-muted hover:text-foreground`}
        >
          <Bookmark size={13} strokeWidth={1.75} aria-hidden="true" />
          Unsave
        </button>
      )}

      {item.state === 'archived' ? (
        <button
          type="button"
          disabled={pending}
          onClick={handleUnfile}
          className={`${iconButton} text-muted hover:text-foreground`}
        >
          <ArchiveRestore size={13} strokeWidth={1.75} aria-hidden="true" />
          Unarchive
        </button>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={handleArchive}
          className={`${iconButton} text-muted hover:text-foreground`}
        >
          <Archive size={13} strokeWidth={1.75} aria-hidden="true" />
          Archive
        </button>
      )}

      {showDelete && item.state === 'saved' && (
        <button
          type="button"
          disabled={pending}
          onClick={handleDelete}
          className={`${iconButton} text-muted hover:text-danger`}
        >
          <Trash2 size={13} strokeWidth={1.75} aria-hidden="true" />
          Delete
        </button>
      )}
    </div>
  )
}
