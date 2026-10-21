import type { Story } from '@/lib/stories/data'
import { setArticleFolders } from '@/lib/folders/actions'
import { ensureSummaries } from '@/lib/ondemand/actions'

// Saves every source of a story into the folders, so a grouped story is
// kept whole. Returns an error message, or null. Every saved article keeps
// a summary; the missing ones are written without holding up the save.
export async function saveStory(story: Story, folderIds: string[]): Promise<string | null> {
  for (const source of story.sources) {
    const result = await setArticleFolders(source.id, folderIds)
    if (result.error) return result.error
  }
  void ensureSummaries(story.sources.filter((source) => !source.summary).map((source) => source.id))
  return null
}
