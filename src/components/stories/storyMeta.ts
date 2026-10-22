import type { Story, StorySource } from '@/lib/stories/data'
import { formatAge } from '@/lib/formatting'

// Small derivations shared by the story row, the reading pane, the "Across
// your feeds" band and the list, so they can't disagree.

// Reading speed for the read time.
const WORDS_PER_MINUTE = 220

// Only https images and icons, so a page never loads mixed content.
export function httpsUrl(url: string | null): string | null {
  return url?.startsWith('https://') ? url : null
}

// The site's own favicon, from the article link's origin. No third-party
// favicon service, which would learn which sites the reader follows.
export function faviconFor(link: string | null): string | null {
  if (!httpsUrl(link)) return null
  try {
    return `${new URL(link!).origin}/favicon.ico`
  } catch {
    return null
  }
}

// "4 min", at least "1 min"; nothing when the full text wasn't fetched.
export function readTime(source: StorySource): string | null {
  return source.wordCount ? `${Math.max(1, Math.ceil(source.wordCount / WORDS_PER_MINUTE))} min` : null
}

// The meta line: feed, age ("3h ago") and read time.
export function sourceMeta(source: StorySource): string {
  return [source.feedTitle, formatAge(source.publishedAt ?? source.createdAt), readTime(source)].filter(Boolean).join(' · ')
}

// Tagged languages: two-letter codes other than English. 'und' (undetectable)
// and three-letter codes (detection found no common language, e.g. 'sco'
// for an English headline) get no tag.
export function taggedLanguage(code: string | null): string | null {
  return code && code !== 'en' && /^[a-z]{2}$/.test(code) ? code : null
}

// The newest https image among the story's sources.
export function storyImage(story: Story): string | null {
  return story.sources.map((s) => httpsUrl(s.imageUrl)).find(Boolean) ?? null
}

// Feeds covering the story, per context.md: two feeds from one outlet are
// two, and one feed posting an update to its own story is one.
export function feedCount(story: Story): number {
  return new Set(story.sources.map((s) => s.feedId)).size
}
