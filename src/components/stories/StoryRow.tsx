'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore, ChevronDown } from 'lucide-react'
import type { Story } from '@/lib/stories/data'
import type { StoryViewMode } from './StoryList'
import { markArticleRead } from '@/lib/articles/actions'
import { addFolder, setArticleFolders } from '@/lib/folders/actions'
import { formatArticleDate } from '@/lib/formatting'
import ArticleFolderPicker from '@/components/articles/ArticleFolderPicker'
import Badge from '@/components/ui/Badge'

export interface FolderOption {
  id: string
  label: string
}

// One story: the newest source's title and feed, a count of the feeds
// covering it, and its actions. Archiving and saving apply to every source
// the reader can see, so the story leaves or is kept as a whole.
export default function StoryRow({
  story,
  view,
  folders,
  onFolderCreated,
  onArchive,
  onUnarchive,
  onSaved,
  selected,
  onToggleSelect,
}: {
  story: Story
  view: StoryViewMode
  folders: FolderOption[]
  onFolderCreated: (folder: FolderOption) => void
  onArchive: (story: Story) => void
  onUnarchive: (story: Story) => void
  onSaved: (story: Story) => void
  selected?: boolean
  onToggleSelect?: (id: string) => void
}) {
  const router = useRouter()
  const [showSources, setShowSources] = useState(false)
  const [addingFolder, setAddingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lead = story.sources[0]
  // The badge counts feeds, per context.md: two feeds from one outlet are
  // two, and one feed posting an update to its own story is one.
  const feedCount = new Set(story.sources.map((s) => s.feedId)).size
  const extraCount = story.sources.length - 1
  const meta = [lead.feedTitle, formatArticleDate(lead.publishedAt ?? lead.createdAt)].filter(Boolean)

  async function saveTo(folderIds: string[]) {
    if (folderIds.length === 0) return
    setPending(true)
    setError(null)
    for (const source of story.sources) {
      const result = await setArticleFolders(source.id, folderIds)
      if (result.error) {
        setPending(false)
        setError(result.error)
        return
      }
    }
    setPending(false)
    onSaved(story)
    router.refresh()
  }

  async function createFolderAndSave() {
    const name = newFolderName.trim()
    setNewFolderName('')
    setAddingFolder(false)
    if (!name) return
    const result = await addFolder({ name, parentId: null })
    if (result.error || !result.id) {
      setError(result.error ?? 'Folder not created')
      return
    }
    onFolderCreated({ id: result.id, label: name })
    await saveTo([result.id])
  }

  return (
    <li className="group px-4 py-3 transition-colors hover:bg-fill-hover">
      <div className="flex items-start gap-3">
        {onToggleSelect && (
          <label className="cw-check mt-0.5 shrink-0">
            <input
              type="checkbox"
              checked={selected ?? false}
              onChange={() => onToggleSelect(story.id)}
              aria-label={`Select ${lead.title}`}
            />
          </label>
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span>{meta.join(' · ')}</span>
            {extraCount > 0 && (
              <button
                type="button"
                onClick={() => setShowSources((v) => !v)}
                aria-expanded={showSources}
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                {feedCount > 1 ? (
                  <Badge>{feedCount} feeds</Badge>
                ) : (
                  <span>
                    {extraCount} more {extraCount === 1 ? 'article' : 'articles'}
                  </span>
                )}
                <ChevronDown
                  size={14}
                  strokeWidth={1.5}
                  aria-hidden="true"
                  className={`transition-transform ${showSources ? 'rotate-180' : ''}`}
                />
              </button>
            )}
          </div>
          {lead.link ? (
            <a
              href={lead.link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => void markArticleRead(lead.id)}
              className="block break-words text-lg font-medium underline-offset-4 hover:underline"
            >
              {lead.title}
            </a>
          ) : (
            <span className="block break-words text-lg font-medium">{lead.title}</span>
          )}

          {showSources && (
            <ul className="mt-2 space-y-1 border-l border-border pl-3">
              {story.sources.slice(1).map((source) => (
                <li key={source.id} className="text-sm">
                  <span className="text-xs text-muted">{source.feedTitle} · </span>
                  {source.link ? (
                    <a
                      href={source.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => void markArticleRead(source.id)}
                      className="underline-offset-4 hover:underline"
                    >
                      {source.title}
                    </a>
                  ) : (
                    source.title
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="-ml-2 mt-1.5 flex flex-wrap items-center gap-1 transition-opacity duration-[var(--dur-fast)] opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
            <ArticleFolderPicker
              selectedIds={[]}
              folders={folders}
              onChange={saveTo}
              addingFolder={addingFolder}
              setAddingFolder={setAddingFolder}
              newFolderName={newFolderName}
              setNewFolderName={setNewFolderName}
              onCreateFolder={createFolderAndSave}
              disabled={pending}
            />
            {view === 'inbox' ? (
              <button type="button" disabled={pending} onClick={() => onArchive(story)} className="cw-btn cw-btn--ghost cw-btn--sm">
                <Archive strokeWidth={1.5} aria-hidden="true" />
                Archive
              </button>
            ) : (
              <button type="button" disabled={pending} onClick={() => onUnarchive(story)} className="cw-btn cw-btn--ghost cw-btn--sm">
                <ArchiveRestore strokeWidth={1.5} aria-hidden="true" />
                Move to Inbox
              </button>
            )}
          </div>
          {error && <p className="mt-1 text-sm text-danger">{error}</p>}
        </div>
      </div>
    </li>
  )
}
