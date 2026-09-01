'use client'

import type { ArticleItem } from '@/lib/dashboard/data'
import type { FolderOption } from './ArticleCard'
import type { useArticleCardActions } from './useArticleCardActions'

// A sentinel folder-select value distinct from both "" (no folder) and any
// real folder id, so picking it can be told apart from an actual selection.
const NEW_FOLDER_OPTION = '__new_folder__'

// Archive/Delete and folder-assignment on one row (unified — these used to
// be two separate stacked rows). Shared between ArticleCard (list) and
// ArticleCardGrid (card) so the two layouts can't drift. There's no
// standalone Save action — filing an article into a folder is what saves
// it (see handleFolderChange in useArticleCardActions).
export default function ArticleCardActionsRow({
  item,
  actions,
  folders,
  showFolderPicker = false,
  showDelete = false,
  showAddToReader = false,
}: {
  item: ArticleItem
  actions: ReturnType<typeof useArticleCardActions>
  folders?: FolderOption[]
  showFolderPicker?: boolean
  showDelete?: boolean
  // Inbox only — moves this one article to Reader. See ArticleCard/
  // ArticleCardGrid's showReaderLink prop, which this is tied to.
  showAddToReader?: boolean
}) {
  const {
    pending,
    addingFolder,
    setAddingFolder,
    newFolderName,
    setNewFolderName,
    handleArchive,
    handleAddToReader,
    handleUnfile,
    handleDelete,
    handleFolderChange,
    handleCreateFolder,
  } = actions

  return (
    <div className="flex items-center gap-3 mt-1 flex-wrap">
      {showAddToReader && item.state === null && (
        <button
          type="button"
          disabled={pending}
          onClick={handleAddToReader}
          className="text-sm text-accent hover:opacity-80 transition-colors disabled:opacity-50"
        >
          Read
        </button>
      )}
      {item.state === 'saved' && (
        <button
          type="button"
          disabled={pending}
          onClick={handleUnfile}
          className="text-sm text-muted hover:text-accent transition-colors disabled:opacity-50"
        >
          Unsave
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
          className="text-sm text-danger hover:opacity-80 transition-colors disabled:opacity-50"
        >
          Archive
        </button>
      )}
      {showDelete && (item.state === 'saved' || item.state === 'reading') && (
        <button
          type="button"
          disabled={pending}
          onClick={handleDelete}
          className="text-sm text-danger hover:opacity-80 transition-colors disabled:opacity-50"
        >
          Delete
        </button>
      )}
      {showFolderPicker && folders && (
        <div className="flex items-center gap-1">
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
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
              <option value={NEW_FOLDER_OPTION}>+ New folder</option>
            </select>
          )}
        </div>
      )}
    </div>
  )
}
