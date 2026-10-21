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

// The Inbox and Archive, grouped into stories by the story_feed function
// (see the story_grouping migration), newest activity first. Bounded by
// the retention windows (12h Inbox, 24h after archiving), so it's read in
// one go rather than paginated.
export async function getStories(view: StoryView, query?: string): Promise<Story[]> {
  const user = await getUser()
  if (!user) return []

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('story_feed', {
    p_view: view,
    // Escaped so % and _ in a search match themselves, not any text.
    p_query: query?.trim().replace(/[\\%_]/g, '\\$&') || null,
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
}

// The sidebar's Inbox count: stories, not articles.
export async function getInboxStoryCount(): Promise<number> {
  const user = await getUser()
  if (!user) return 0

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('inbox_story_count')
  logQueryError('stories/getInboxStoryCount', error)
  return Number(data ?? 0)
}

// The sidebar's category counts: Inbox stories per category id. A story
// whose feeds span categories counts in each, as in the Inbox sections.
export async function getInboxCategoryCounts(): Promise<Record<string, number>> {
  const user = await getUser()
  if (!user) return {}

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('inbox_category_counts')
  logQueryError('stories/getInboxCategoryCounts', error)
  return Object.fromEntries(
    ((data ?? []) as { category_id: string; stories: number }[]).map((row) => [row.category_id, Number(row.stories)])
  )
}
