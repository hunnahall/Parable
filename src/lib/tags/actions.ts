'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getUser } from '@/lib/supabase/server'

// Global rename/delete across every article that has this tag. supabase-js's
// .update() takes a literal value, not a SQL expression, so array_replace/
// array_remove aren't reachable through the query builder — this fetches
// the small set of matching rows (personal-scale data) via the `cs`
// (array-contains) filter and rewrites each one's tags array in JS instead
// of adding a database function just for this.
async function rewriteTagAcrossArticles(
  tag: string,
  rewrite: (tags: string[]) => string[]
): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const supabase = await createClient()
  const { data, error: fetchError } = await supabase
    .from('article_states')
    .select('feed_item_id, tags')
    .eq('user_id', user.id)
    .contains('tags', [tag])
  if (fetchError) return { error: fetchError.message }

  for (const row of data ?? []) {
    const nextTags = rewrite(row.tags ?? [])
    const { error } = await supabase
      .from('article_states')
      .update({ tags: nextTags })
      .eq('user_id', user.id)
      .eq('feed_item_id', row.feed_item_id)
    if (error) return { error: error.message }
  }

  revalidatePath('/articles')
  revalidatePath('/saved')
  revalidatePath('/archive')
  revalidatePath('/feeds')
  return { error: null }
}

export async function renameTagGlobally(
  oldTag: string,
  newTag: string
): Promise<{ error: string | null }> {
  const trimmed = newTag.trim()
  if (!trimmed) return { error: 'New tag name is required' }
  return rewriteTagAcrossArticles(oldTag, (tags) =>
    [...new Set(tags.map((t) => (t === oldTag ? trimmed : t)))]
  )
}

export async function deleteTagGlobally(tag: string): Promise<{ error: string | null }> {
  return rewriteTagAcrossArticles(tag, (tags) => tags.filter((t) => t !== tag))
}
