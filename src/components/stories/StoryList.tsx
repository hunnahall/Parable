'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Archive } from 'lucide-react'
import type { Story } from '@/lib/stories/data'
import { markStoriesSeen } from '@/lib/stories/actions'
import type { CategoryRow } from '@/lib/categories/data'
import type { FilteredTitle } from '@/lib/filters/data'
import { archiveArticlesBulk, unarchiveArticles } from '@/lib/articles/actions'
import StoryRow, { type FolderOption } from './StoryRow'
import CategoryTabs from './CategoryTabs'
import InboxOverview from './InboxOverview'
import AcrossFeedsBand from './AcrossFeedsBand'
import ReaderView from './ReaderView'
import Button, { buttonClass } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import EmptyState from '@/components/ui/EmptyState'
import { ARCHIVE_ALL_EVENT } from '@/components/layout/CommandPalette'
import { useToast } from '@/components/ui/Toast'

export type StoryViewMode = 'inbox' | 'archive'

const EMPTY_COPY: Record<StoryViewMode, { title: string; text: string }> = {
  inbox: {
    title: 'Nothing new',
    text: 'Stories from the last 12 hours show up here as your feeds publish them.',
  },
  archive: {
    title: 'Nothing archived',
    text: 'Archived stories wait here for 24 hours, then go.',
  },
}

interface Section {
  key: string
  title: string | null
  stories: Story[]
}

// The Inbox and Archive list stories under each category, in the user's order. A story
// whose feeds span categories appears in each of them; stories keep the
// server's newest-activity-first order within a section. Without categories
// it's one list. Stories from uncategorized feeds go last.
function sectionsFor(stories: Story[], categories: CategoryRow[]): Section[] {
  if (categories.length === 0) return [{ key: 'all', title: null, stories }]

  const sections: Section[] = categories.map((category) => ({
    key: category.id,
    title: category.name,
    stories: stories.filter((story) => story.sources.some((s) => s.categoryId === category.id)),
  }))
  const known = new Set(categories.map((c) => c.id))
  sections.push({
    key: 'none',
    title: 'No category',
    stories: stories.filter((story) => story.sources.some((s) => !s.categoryId || !known.has(s.categoryId))),
  })
  return sections.filter((section) => section.stories.length > 0)
}

// Seen means on screen long enough to read the title. Compared as times,
// since the strings come from different places (Postgres, the browser).
function isStorySeen(story: Pick<Story, 'seenAt' | 'lastActivityAt'>): boolean {
  return story.seenAt !== null && new Date(story.seenAt) >= new Date(story.lastActivityAt)
}

const ids = (stories: Story[]) => stories.flatMap((story) => story.sources.map((s) => s.id))

const inCategory = (story: Story, categoryId: string) => story.sources.some((s) => s.categoryId === categoryId)

// How long a removed row takes to collapse: tokens.css --dur-std.
const COLLAPSE_MS = 200

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// The Inbox and Archive: stories, newest activity first. A story is every
// article about the same thing from the reader's feeds; archiving or saving
// it applies to all of them.
//
// The Inbox also gets category tabs, an overview panel (stats, seen
// progress, stories by category) and the "Across your feeds" band. It
// receives every story and filters to `categoryId` here, so the tab counts
// and stats follow archiving without a round trip.
export default function StoryList({
  stories,
  view,
  folders: initialFolders,
  categories = [],
  categoryId = null,
  filteredTitles = [],
  query,
  basePath,
}: {
  stories: Story[]
  view: StoryViewMode
  folders: FolderOption[]
  categories?: CategoryRow[]
  // The Inbox's ?category=, already checked against `categories`.
  categoryId?: string | null
  filteredTitles?: FilteredTitle[]
  query: string
  basePath: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  // Rows collapsing on their way out. A ref mirrors it so the timer that
  // removes them skips any that Undo or an error brought back meanwhile.
  const [leaving, setLeaving] = useState<Set<string>>(new Set())
  const leavingRef = useRef<Set<string>>(new Set())
  const [folders, setFolders] = useState(initialFolders)
  const [queryDraft, setQueryDraft] = useState(query)
  const [bulkPending, setBulkPending] = useState(false)
  // A band card opens the reader here, since the band has no rows of its own.
  const [readerStory, setReaderStory] = useState<Story | null>(null)
  // Stories seen this visit, keyed to the activity time they were seen at,
  // so a story that gains a source after being seen lights up again.
  const [seenLocally, setSeenLocally] = useState<Map<string, string>>(new Map())
  const pendingSeen = useRef<Set<string>>(new Set())
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const visible = stories.filter((story) => !removed.has(story.id))
  // What's on screen: one category's stories, or all of them.
  const shown = categoryId ? visible.filter((story) => inCategory(story, categoryId)) : visible
  const showTabs = view === 'inbox' && categories.length > 0

  function setLeavingIds(next: Set<string>) {
    leavingRef.current = next
    setLeaving(next)
  }

  // Collapses the rows, then takes them out of the list.
  function hide(storyIds: string[]) {
    setLeavingIds(new Set([...leavingRef.current, ...storyIds]))
    setTimeout(
      () => {
        const done = storyIds.filter((id) => leavingRef.current.has(id))
        if (done.length === 0) return
        setLeavingIds(new Set([...leavingRef.current].filter((id) => !done.includes(id))))
        setRemoved((prev) => new Set([...prev, ...done]))
      },
      prefersReducedMotion() ? 0 : COLLAPSE_MS
    )
  }

  function unhide(storyIds: string[]) {
    setLeavingIds(new Set([...leavingRef.current].filter((id) => !storyIds.includes(id))))
    setRemoved((prev) => new Set([...prev].filter((id) => !storyIds.includes(id))))
  }

  async function archive(targets: Story[]) {
    hide(targets.map((s) => s.id))
    const result = await archiveArticlesBulk(ids(targets))
    if (result.error) {
      unhide(targets.map((s) => s.id))
      toast(`Not archived. ${result.error}`, 'danger')
      return
    }
    toast(targets.length === 1 ? 'Story archived' : `${targets.length} stories archived`, 'default', {
      label: 'Undo',
      onClick: async () => {
        unhide(targets.map((s) => s.id))
        await unarchiveArticles(ids(targets))
        router.refresh()
      },
    })
    router.refresh()
  }

  async function unarchive(story: Story) {
    hide([story.id])
    const result = await unarchiveArticles(ids([story]))
    if (result.error) {
      unhide([story.id])
      toast(`Not moved. ${result.error}`, 'danger')
      return
    }
    toast('Moved to Inbox')
    router.refresh()
  }

  // Archives exactly the stories on screen when pressed. An article that
  // arrives afterwards isn't in this list, so it stays in the Inbox.
  async function archiveAll() {
    const targets = shown.filter((story) => !leavingRef.current.has(story.id))
    if (targets.length === 0) return
    setBulkPending(true)
    await archive(targets)
    setBulkPending(false)
  }

  // The command palette's Archive all. A ref keeps the listener on the
  // latest list without re-subscribing on every render.
  const archiveAllRef = useRef(archiveAll)
  useEffect(() => {
    archiveAllRef.current = archiveAll
  })
  useEffect(() => {
    if (view !== 'inbox') return
    const onArchiveAll = () => void archiveAllRef.current()
    window.addEventListener(ARCHIVE_ALL_EVENT, onArchiveAll)
    return () => window.removeEventListener(ARCHIVE_ALL_EVENT, onArchiveAll)
  }, [view])

  function flushSeen() {
    flushTimer.current = null
    const batch = [...pendingSeen.current]
    pendingSeen.current.clear()
    if (batch.length > 0) void markStoriesSeen(batch)
  }

  const handleSeen = useCallback((story: Story) => {
    setSeenLocally((prev) => new Map(prev).set(story.id, story.lastActivityAt))
    pendingSeen.current.add(story.id)
    flushTimer.current ??= setTimeout(flushSeen, 1500)
  }, [])

  // Send what's queued when leaving the page.
  useEffect(
    () => () => {
      if (flushTimer.current) clearTimeout(flushTimer.current)
      flushSeen()
    },
    []
  )

  function isSeen(story: Story): boolean {
    if (view !== 'inbox') return false
    return isStorySeen(story) || seenLocally.get(story.id) === story.lastActivityAt
  }

  // The section's stories on screen, minus any already on their way out.
  function archiveSection(sectionStories: Story[]) {
    const targets = sectionStories.filter((story) => !leavingRef.current.has(story.id))
    if (targets.length > 0) void archive(targets)
  }

  const tabCounts = new Map(categories.map((c) => [c.id, visible.filter((story) => inCategory(story, c.id)).length]))
  const activeCategory = categories.find((c) => c.id === categoryId)

  function commitSearch() {
    const q = queryDraft.trim()
    router.push(q ? `${basePath}?q=${encodeURIComponent(q)}` : basePath)
  }

  return (
    // --tabs-h: the phone tab row's height, so section heads stick below it.
    <div className="space-y-4 [--tabs-h:40px]">
      {view === 'archive' && (
        <Input
          type="search"
          placeholder="Search titles"
          aria-label="Search titles"
          value={queryDraft}
          onChange={(e) => setQueryDraft(e.target.value)}
          onBlur={commitSearch}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitSearch()
          }}
        />
      )}

      {showTabs && <CategoryTabs categories={categories} counts={tabCounts} total={visible.length} current={categoryId} />}

      {view === 'inbox' && shown.length > 0 && (
        <InboxOverview
          stories={shown}
          seenCount={shown.filter(isSeen).length}
          filteredTitles={filteredTitles}
          categories={categories}
          showChart={!categoryId}
        />
      )}

      {view === 'inbox' && !categoryId && (
        <AcrossFeedsBand
          stories={visible}
          isSeen={isSeen}
          onOpen={(story) => {
            handleSeen(story)
            setReaderStory(story)
          }}
        />
      )}

      {view === 'inbox' && shown.length > 0 && (
        <div className="flex items-center justify-end">
          {/* The Inbox's one accent button. */}
          <Button variant="accent" size="sm" disabled={bulkPending} onClick={archiveAll}>
            <Archive strokeWidth={1.5} aria-hidden="true" />
            {bulkPending ? 'Archiving' : 'Archive all'}
          </Button>
        </div>
      )}

      {shown.length === 0 ? (
        query ? (
          <EmptyState title="No matching stories">Try a different search.</EmptyState>
        ) : activeCategory ? (
          <EmptyState title={`Nothing new in ${activeCategory.name}`}>
            Stories from this category&rsquo;s feeds show up here as they publish them.
          </EmptyState>
        ) : (
          <EmptyState
            title={EMPTY_COPY[view].title}
            action={
              view === 'inbox' ? (
                <Link href="/feeds" className={buttonClass({ variant: 'primary' })}>
                  Add a feed
                </Link>
              ) : undefined
            }
          >
            {EMPTY_COPY[view].text}
          </EmptyState>
        )
      ) : (
        <div className="space-y-6">
          {/* Search results are one flat list, so each story is one result. */}
          {sectionsFor(shown, query ? [] : activeCategory ? [activeCategory] : categories).map((section) => (
            // No overflow: hidden on the panel; it would stop the head
            // from sticking.
            <section key={section.key} aria-label={section.title ?? undefined} className="cw-panel">
              {section.title && (
                <div
                  className={`cw-panel__head sticky top-0 z-[5] bg-surface ${
                    showTabs ? 'max-[999px]:top-[calc(3.5rem+var(--tabs-h))]' : 'max-[999px]:top-14'
                  }`}
                >
                  <h2 className="text-sm font-medium">
                    {section.title}{' '}
                    <span className="font-mono text-xs font-normal tabular-nums text-muted">{section.stories.length}</span>
                  </h2>
                  {view === 'inbox' && (
                    <button
                      type="button"
                      onClick={() => archiveSection(section.stories)}
                      className="cw-btn cw-btn--ghost cw-btn--sm"
                    >
                      <Archive strokeWidth={1.5} aria-hidden="true" />
                      Archive section
                    </button>
                  )}
                </div>
              )}
              <ul className="divide-y divide-border">
                {section.stories.map((story) => (
                  <StoryRow
                    key={`${section.key}-${story.id}`}
                    story={story}
                    view={view}
                    folders={folders}
                    onFolderCreated={(folder) => setFolders((prev) => [...prev, folder])}
                    onArchive={(s) => archive([s])}
                    onUnarchive={unarchive}
                    onSaved={(s) => {
                      hide([s.id])
                      toast('Story saved')
                    }}
                    seen={isSeen(story)}
                    leaving={leaving.has(story.id)}
                    onSeen={view === 'inbox' ? handleSeen : undefined}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {readerStory && <ReaderView story={readerStory} onClose={() => setReaderStory(null)} />}
    </div>
  )
}
