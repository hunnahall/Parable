import { cache } from 'react'
import { createClient, getUser } from '@/lib/supabase/server'
import { logQueryError } from '@/lib/supabase/logError'

// One source of a story: an article from one of the reader's feeds.
export interface StorySource {
  id: string
  feedId: string
  feedTitle: string | null
  categoryId: string | null
  title: string
  link: string | null
  publishedAt: string | null
  createdAt: string
  imageUrl: string | null
  summary: string | null
  archivedAt: string | null
  // Words in the stored text, only when the full article was fetched.
  wordCount: number | null
  // ISO 639-1 code detected at ingest; 'und' when undetectable.
  language: string | null
}

// A story: every article sharing a story_id that the reader can see in
// this view, newest source first. Two feeds from one outlet count as two
// sources.
export interface Story {
  id: string
  lastActivityAt: string
  // When the reader last had it on screen, or null. Dimmed while this is at
  // or after lastActivityAt.
  seenAt: string | null
  sources: StorySource[]
}

export type StoryView = 'inbox' | 'archive'

type RawSource = {
  id: string
  feed_id: string
  feed_title: string | null
  category_id: string | null
  title: string
  link: string | null
  published_at: string | null
  created_at: string
  image_url: string | null
  summary: string | null
  archived_at: string | null
  word_count?: number | null
  language?: string | null
}

// The most stories one view returns. The windows bound it (12h Inbox, 24h
// after archiving); at 50 feeds a 12-hour Inbox can pass 600, so the
// function's default would silently cut the list.
const STORY_LIMIT = 2000

// The Inbox and Archive, grouped into stories by the story_feed function
// (see the story_grouping migration), newest activity first. Bounded by
// the retention windows (12h Inbox, 24h after archiving), so it's read in
// one go rather than paginated. Cached per request: the root layout reads
// the Inbox for the sidebar's counts, and the Inbox page reuses it.
export const getStories = cache(async (view: StoryView, query?: string): Promise<Story[]> => {
  const user = await getUser()
  if (!user) return []

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('story_feed', {
    p_view: view,
    // Escaped so % and _ in a search match themselves, not any text.
    p_query: query?.trim().replace(/[\\%_]/g, '\\$&') || null,
    p_limit: STORY_LIMIT,
  })
  logQueryError(`stories/getStories (${view})`, error)

  return ((data ?? []) as { story_id: string; last_activity_at: string; seen_at: string | null; items: RawSource[] }[]).map(
    (row) => ({
      id: row.story_id,
      lastActivityAt: row.last_activity_at,
      seenAt: row.seen_at,
      sources: row.items.map((item) => ({
        id: item.id,
        feedId: item.feed_id,
        feedTitle: item.feed_title,
        categoryId: item.category_id,
        title: item.title,
        link: item.link,
        publishedAt: item.published_at,
        createdAt: item.created_at,
        imageUrl: item.image_url,
        summary: item.summary,
        archivedAt: item.archived_at,
        wordCount: item.word_count ?? null,
        language: item.language ?? null,
      })),
    })
  )
})

// The sidebar's counts, from the Inbox's stories: the total, and stories per
// category id, a story whose feeds span categories counting in each (the
// Inbox sections' rule). Worked out here rather than with the
// inbox_story_count and inbox_category_counts functions, which each ran
// story_feed again.
export function inboxCounts(stories: Story[]): { total: number; byCategory: Record<string, number> } {
  const byCategory: Record<string, number> = {}
  for (const story of stories) {
    for (const id of new Set(story.sources.map((s) => s.categoryId))) {
      if (id) byCategory[id] = (byCategory[id] ?? 0) + 1
    }
  }
  return { total: stories.length, byCategory }
}
