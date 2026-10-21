'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore, ExternalLink, Sparkles } from 'lucide-react'
import type { Story } from '@/lib/stories/data'
import { addFolder } from '@/lib/folders/actions'
import { formatAge } from '@/lib/formatting'
import { languageLabel } from '@/lib/languages'
import ArticleFolderPicker from '@/components/articles/ArticleFolderPicker'
import EmptyState from '@/components/ui/EmptyState'
import Tooltip from '@/components/ui/Tooltip'
import type { FolderOption } from './StoryRow'
import type { StoryViewMode } from './StoryList'
import ReaderContent from './ReaderContent'
import SourcePicker from './SourcePicker'
import StorySummary from './StorySummary'
import { saveStory } from './saveStory'

const WORDS_PER_MINUTE = 220

// https only, so the pane never loads mixed content.
const httpsUrl = (url: string | null) => (url?.startsWith('https://') ? url : null)

// The Inbox's reading pane at 1280px and up: the selected story's reader
// view beside the list. Header with the source's feed, age, read time and
// language, a source switch, and the story's actions; then the image,
// headline and text in the reading serif. A 4px accent bar along the top
// tracks how far down the pane has been read.
export default function ReadingPane({
  story,
  view,
  folders,
  onFolderCreated,
  onArchive,
  onUnarchive,
  onSaved,
}: {
  story: Story | null
  view: StoryViewMode
  folders: FolderOption[]
  onFolderCreated: (folder: FolderOption) => void
  onArchive: (story: Story) => void
  onUnarchive: (story: Story) => void
  onSaved: (story: Story) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [progress, setProgress] = useState(0)

  // Back to the top for each new story. The scroll event that follows
  // resets the progress bar (already zero if the pane was at the top).
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [story?.id])

  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    const room = el.scrollHeight - el.clientHeight
    setProgress(room > 0 ? Math.min(1, el.scrollTop / room) : 0)
  }

  return (
    <aside
      aria-label="Reading pane"
      className="sticky top-0 flex h-dvh flex-col border-l border-border bg-surface"
    >
      <div className="h-1 shrink-0" aria-hidden="true">
        <div className="h-full bg-accent" style={{ width: `${progress * 100}%` }} />
      </div>
      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
        {story ? (
          <PaneStory
            key={story.id}
            story={story}
            view={view}
            folders={folders}
            onFolderCreated={onFolderCreated}
            onArchive={onArchive}
            onUnarchive={onUnarchive}
            onSaved={onSaved}
          />
        ) : (
          <div className="p-8">
            <EmptyState title="Select a story">Its text opens here, in English, beside the list.</EmptyState>
          </div>
        )}
      </div>
    </aside>
  )
}

function PaneStory({
  story,
  view,
  folders,
  onFolderCreated,
  onArchive,
  onUnarchive,
  onSaved,
}: {
  story: Story
  view: StoryViewMode
  folders: FolderOption[]
  onFolderCreated: (folder: FolderOption) => void
  onArchive: (story: Story) => void
  onUnarchive: (story: Story) => void
  onSaved: (story: Story) => void
}) {
  const router = useRouter()
  const [sourceId, setSourceId] = useState(story.sources[0].id)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [addingFolder, setAddingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageFailed, setImageFailed] = useState(false)
  const [faviconFailed, setFaviconFailed] = useState(false)

  const source = story.sources.find((s) => s.id === sourceId) ?? story.sources[0]
  const image = imageFailed ? null : httpsUrl(source.imageUrl)
  let favicon: string | null = null
  if (!faviconFailed && httpsUrl(source.link)) {
    try {
      favicon = `${new URL(source.link!).origin}/favicon.ico`
    } catch {
      favicon = null
    }
  }
  const readTime = source.wordCount ? `${Math.max(1, Math.ceil(source.wordCount / WORDS_PER_MINUTE))} min` : null
  const meta = [source.feedTitle, formatAge(source.publishedAt ?? source.createdAt), readTime].filter(Boolean).join(' · ')
  const language = source.language && source.language !== 'en' && /^[a-z]{2}$/.test(source.language) ? source.language : null
  const iconButton = 'cw-btn cw-btn--ghost cw-btn--sm cw-btn--icon'

  async function saveTo(folderIds: string[]) {
    if (folderIds.length === 0) return
    setPending(true)
    setError(null)
    const saveError = await saveStory(story, folderIds)
    setPending(false)
    if (saveError) {
      setError(saveError)
      return
    }
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
    <article className="mx-auto max-w-[calc(var(--read-max)+4rem)] space-y-5 px-8 py-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {favicon && (
            // A plain img: no Vercel image-optimization quota, no proxy.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={favicon}
              alt=""
              width={16}
              height={16}
              referrerPolicy="no-referrer"
              onError={() => setFaviconFailed(true)}
              className="size-4 shrink-0"
            />
          )}
          <span suppressHydrationWarning>{meta}</span>
          {language && (
            <Tooltip label={languageLabel(language)}>
              <span className="cw-tag" aria-label={languageLabel(language)}>
                {language.toUpperCase()}
              </span>
            </Tooltip>
          )}
        </div>

        <SourcePicker sources={story.sources} value={sourceId} onChange={setSourceId} id={`pane-source-${story.id}`} />

        <div className="-ml-2 flex flex-wrap items-center gap-1">
          <Tooltip label="Summary">
            <button
              type="button"
              onClick={() => setSummaryOpen((v) => !v)}
              aria-expanded={summaryOpen}
              aria-label="Summary"
              className={`${iconButton} ${summaryOpen ? 'text-foreground' : ''}`}
            >
              <Sparkles strokeWidth={1.5} aria-hidden="true" />
            </button>
          </Tooltip>
          <Tooltip label="Save">
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
              iconOnly
            />
          </Tooltip>
          <Tooltip label={view === 'inbox' ? 'Archive' : 'Move to Inbox'}>
            <button
              type="button"
              disabled={pending}
              onClick={() => (view === 'inbox' ? onArchive(story) : onUnarchive(story))}
              aria-label={view === 'inbox' ? 'Archive' : 'Move to Inbox'}
              className={iconButton}
            >
              {view === 'inbox' ? (
                <Archive strokeWidth={1.5} aria-hidden="true" />
              ) : (
                <ArchiveRestore strokeWidth={1.5} aria-hidden="true" />
              )}
            </button>
          </Tooltip>
          {source.link && (
            <a href={source.link} target="_blank" rel="noopener noreferrer" className="cw-btn cw-btn--ghost cw-btn--sm">
              <ExternalLink strokeWidth={1.5} aria-hidden="true" />
              Open publisher
            </a>
          )}
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        {summaryOpen && <StorySummary key={source.id} story={story} />}
      </header>

      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
          className="max-h-80 w-full border border-border bg-fill-active object-cover"
        />
      )}

      <h2 className="break-words font-read text-[length:var(--text-2xl)] font-medium leading-[var(--leading-snug)] tracking-[var(--tracking-title)]">
        {source.title}
      </h2>

      <div className="max-w-[var(--read-max)]">
        <ReaderContent key={source.id} source={source} />
      </div>
    </article>
  )
}
