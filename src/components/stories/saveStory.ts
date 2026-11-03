import type { Story } from '@/lib/stories/data'
import { saveArticles } from '@/lib/folders/actions'
import { ensureSummaries } from '@/lib/ondemand/actions'

// Saves every source of a story, into the folders or none, so a grouped
// story is kept whole. Returns an error message, or null. Every saved
// article keeps a summary; the missing ones are written without holding up
// the save.
export async function saveStory(story: Story, folderIds: string[]): Promise<string | null> {
  const result = await saveArticles(
    story.sources.map((source) => source.id),
    folderIds
  )
  if (result.error) return result.error
  void ensureSummaries(story.sources.filter((source) => !source.summary).map((source) => source.id))
  return null
}
