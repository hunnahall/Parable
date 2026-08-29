'use client'

import { Plus } from 'lucide-react'
import type { ArticleItem } from '@/lib/dashboard/data'
import type { FolderOption } from './ArticleCard'
import type { useArticleCardActions } from './useArticleCardActions'

// Save/Archive/Delete and folder-assignment on one row (unified — these
// used to be two separate stacked rows). Shared between ArticleCard
// (list) and ArticleCardGrid (card) so the two layouts can't drift.
export default function ArticleCardActionsRow({
  item,
  actions,
  folders,
  showFolderPicker = false,
  showDelete = false,
}: {
  item: ArticleItem
  actions: ReturnType<typeof useArticleCardActions>
  folders?: FolderOption[]
  showFolderPicker?: boolean
  showDelete?: boolean
}) {
  const {
    pending,
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
  } = actions

  return (
    <div className="flex items-center gap-3 mt-1 flex-wrap">
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
      {showDelete && item.state === 'saved' && (
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
          <select
            value={item.folderId ?? ''}
            onChange={(e) => handleFolderChange(e.target.value || null)}
            className="border border-border px-2 py-1 text-base bg-background"
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
              className="w-28 border border-border px-2 py-1 text-base bg-background"
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
      )}
    </div>
  )
}
