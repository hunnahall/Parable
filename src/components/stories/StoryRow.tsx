'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore, BookOpen, ChevronDown, EyeOff, ExternalLink, FolderPlus, Sparkles } from 'lucide-react'
import type { Story } from '@/lib/stories/data'
import type { StoryViewMode } from './StoryList'
import { markArticleRead } from '@/lib/articles/actions'
import { addFolder, setArticleFolders } from '@/lib/folders/actions'
import { formatAge } from '@/lib/formatting'
import ArticleFolderPicker from '@/components/articles/ArticleFolderPicker'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import HideWordDialog from './HideWordDialog'
import ReaderView from './ReaderView'
import StorySummary from './StorySummary'
import { ensureSummaries } from '@/lib/ondemand/actions'
import { Input } from '@/components/ui/Input'

export interface FolderOption {
  id: string
  label: string
}

// On screen this long (and at least half visible) counts as seen.
const SEEN_AFTER_MS = 1000

// One story: the newest source's title and feed, a count of the feeds
// covering it, and its actions. Archiving and saving apply to every source
// the reader can see, so the story leaves or is kept as a whole.
//
// Desktop shows the actions on hover. On phone (under 640px) tapping the
// story opens a panel with them instead, since there's no hover.
export default function StoryRow({
  story,
  view,
  folders,
  dimmed = false,
  onSeen,
  onFolderCreated,
  onArchive,
  onUnarchive,
  onSaved,
}: {
  story: Story
  view: StoryViewMode
  folders: FolderOption[]
  dimmed?: boolean
  onSeen?: (story: Story) => void
  onFolderCreated: (folder: FolderOption) => void
  onArchive: (story: Story) => void
  onUnarchive: (story: Story) => void
  onSaved: (story: Story) => void
}) {
  const router = useRouter()
  const rowRef = useRef<HTMLLIElement>(null)
  const [showSources, setShowSources] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [hideWordOpen, setHideWordOpen] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [readerOpen, setReaderOpen] = useState(false)
  const [addingFolder, setAddingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lead = story.sources[0]
  // The badge counts feeds, per context.md: two feeds from one outlet are
  // two, and one feed posting an update to its own story is one.
  const feedCount = new Set(story.sources.map((s) => s.feedId)).size
  const extraCount = story.sources.length - 1
  const age = formatAge(lead.publishedAt ?? lead.createdAt)
  const meta = [lead.feedTitle, age].filter(Boolean).join(' · ')

  // Seen tracking. Restarts when the story gains a source, since that
  // undims it.
  useEffect(() => {
    const el = rowRef.current
    if (!onSeen || dimmed || !el) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          timer ??= setTimeout(() => onSeen(story), SEEN_AFTER_MS)
        } else if (timer) {
          clearTimeout(timer)
          timer = null
        }
      },
      { threshold: 0.5 }
    )
    observer.observe(el)
    return () => {
      observer.disconnect()
      if (timer) clearTimeout(timer)
    }
  }, [onSeen, dimmed, story])

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
    setPanelOpen(false)
    // Every saved article keeps a summary; write the missing ones without
    // holding up the save.
    void ensureSummaries(story.sources.filter((source) => !source.summary).map((source) => source.id))
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

  function archiveOrRestore() {
    setPanelOpen(false)
    if (view === 'inbox') onArchive(story)
    else onUnarchive(story)
  }

  const archiveButton =
    view === 'inbox' ? (
      <button type="button" disabled={pending} onClick={archiveOrRestore} className="cw-btn cw-btn--ghost cw-btn--sm">
        <Archive strokeWidth={1.5} aria-hidden="true" />
        Archive
      </button>
    ) : (
      <button type="button" disabled={pending} onClick={archiveOrRestore} className="cw-btn cw-btn--ghost cw-btn--sm">
        <ArchiveRestore strokeWidth={1.5} aria-hidden="true" />
        Move to Inbox
      </button>
    )

  return (
    <li
      ref={rowRef}
      className={`group px-4 py-3 transition-[background-color,opacity] duration-[var(--dur-std)] hover:bg-fill-hover ${dimmed ? 'opacity-55' : ''}`}
    >
      <div className="mb-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span suppressHydrationWarning>{meta}</span>
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

      {/* Phone: the title opens the action panel. */}
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        className="block w-full break-words text-left text-lg font-medium min-[640px]:hidden"
      >
        {lead.title}
      </button>
      {/* Desktop: the title goes to the publisher. */}
      <div className="hidden min-[640px]:block">
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
      </div>

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

      {summaryOpen && <StorySummary story={story} />}

      <div className="-ml-2 mt-1.5 hidden flex-wrap items-center gap-1 opacity-0 transition-opacity duration-[var(--dur-fast)] group-hover:opacity-100 group-focus-within:opacity-100 min-[640px]:flex [@media(hover:none)]:opacity-100">
        <button
          type="button"
          onClick={() => setSummaryOpen((v) => !v)}
          aria-expanded={summaryOpen}
          className="cw-btn cw-btn--ghost cw-btn--sm"
        >
          <Sparkles strokeWidth={1.5} aria-hidden="true" />
          Summary
        </button>
        <button type="button" onClick={() => setReaderOpen(true)} className="cw-btn cw-btn--ghost cw-btn--sm">
          <BookOpen strokeWidth={1.5} aria-hidden="true" />
          Reader view
        </button>
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
        {archiveButton}
        {view === 'inbox' && (
          <button type="button" disabled={pending} onClick={() => setHideWordOpen(true)} className="cw-btn cw-btn--ghost cw-btn--sm">
            <EyeOff strokeWidth={1.5} aria-hidden="true" />
            Hide word
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}

      <Modal open={panelOpen} onClose={() => setPanelOpen(false)} title={lead.title} labelledBy={`story-panel-${story.id}`}>
        <div className="space-y-4">
          <p className="text-xs text-muted" suppressHydrationWarning>
            {meta}
            {feedCount > 1 && ` · ${feedCount} feeds`}
          </p>
          <div className="flex flex-col items-stretch gap-1">
            {lead.link && (
              <a
                href={lead.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  void markArticleRead(lead.id)
                  setPanelOpen(false)
                }}
                className="cw-btn cw-btn--ghost justify-start"
              >
                <ExternalLink strokeWidth={1.5} aria-hidden="true" />
                Open {lead.feedTitle ?? 'publisher'}
              </a>
            )}
            <button
              type="button"
              onClick={() => {
                setPanelOpen(false)
                setReaderOpen(true)
              }}
              className="cw-btn cw-btn--ghost justify-start"
            >
              <BookOpen strokeWidth={1.5} aria-hidden="true" />
              Reader view
            </button>
            <button
              type="button"
              onClick={() => {
                setPanelOpen(false)
                setSummaryOpen(true)
              }}
              className="cw-btn cw-btn--ghost justify-start"
            >
              <Sparkles strokeWidth={1.5} aria-hidden="true" />
              Summary
            </button>
            {view === 'inbox' ? (
              <button type="button" disabled={pending} onClick={archiveOrRestore} className="cw-btn cw-btn--ghost justify-start">
                <Archive strokeWidth={1.5} aria-hidden="true" />
                Archive
              </button>
            ) : (
              <button type="button" disabled={pending} onClick={archiveOrRestore} className="cw-btn cw-btn--ghost justify-start">
                <ArchiveRestore strokeWidth={1.5} aria-hidden="true" />
                Move to Inbox
              </button>
            )}
            {view === 'inbox' && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setPanelOpen(false)
                  setHideWordOpen(true)
                }}
                className="cw-btn cw-btn--ghost justify-start"
              >
                <EyeOff strokeWidth={1.5} aria-hidden="true" />
                Hide stories with a word
              </button>
            )}
          </div>

          <div className="space-y-1 border-t border-border pt-3">
            <p className="text-xs text-muted">Save to</p>
            {folders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                disabled={pending}
                onClick={() => saveTo([folder.id])}
                className="cw-btn cw-btn--ghost w-full justify-start"
              >
                <FolderPlus strokeWidth={1.5} aria-hidden="true" />
                {folder.label}
              </button>
            ))}
            <Input
              placeholder="New folder"
              aria-label="New folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void createFolderAndSave()
              }}
            />
          </div>

          {extraCount > 0 && (
            <ul className="space-y-2 border-t border-border pt-3">
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
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </Modal>
      {readerOpen && <ReaderView story={story} onClose={() => setReaderOpen(false)} />}
      {hideWordOpen && (
        <HideWordDialog title={lead.title} storyId={story.id} onClose={() => setHideWordOpen(false)} />
      )}
    </li>
  )
}
