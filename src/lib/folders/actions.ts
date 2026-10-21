'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getUser } from '@/lib/supabase/server'

export async function addFolder(input: {
  name: string
  parentId: string | null
}): Promise<{ id: string | null; error: string | null }> {
  const user = await getUser()
  if (!user) return { id: null, error: 'Not signed in' }

  const name = input.name.trim()
  if (!name) return { id: null, error: 'Name is required' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('folders')
    .insert({ name, parent_id: input.parentId, user_id: user.id })
    .select('id')
    .single()
  if (error) return { id: null, error: error.message }

  revalidatePath('/feeds')
  revalidatePath('/inbox')
  revalidatePath('/saved')
  revalidatePath('/archive')
  return { id: data.id, error: null }
}

export async function updateFolder(
  id: string,
  input: { name: string; parentId: string | null }
): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const name = input.name.trim()
  if (!name) return { error: 'Name is required' }
  if (input.parentId === id) return { error: "A folder can't be its own parent" }

  const supabase = await createClient()
  const { error } = await supabase
    .from('folders')
    .update({ name, parent_id: input.parentId })
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) return { error: error.message }

  revalidatePath('/feeds')
  return { error: null }
}

// Blocks deleting a folder that still has subfolders — an unqualified
// cascade would silently wipe an entire nested subtree from one click, and
// article_folders rows on the folder itself already cascade
// on delete via their FK, so only the subfolder case needs guarding here.
export async function removeFolder(id: string): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const supabase = await createClient()
  const { count, error: childError } = await supabase
    .from('folders')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', id)
    .eq('user_id', user.id)
  if (childError) return { error: childError.message }
  if ((count ?? 0) > 0) {
    return { error: "Move or delete this folder's subfolders first." }
  }

  const { error } = await supabase.from('folders').delete().eq('id', id).eq('user_id', user.id)
  if (error) return { error: error.message }

  revalidatePath('/feeds')
  return { error: null }
}

// Replaces an article's folder membership wholesale. An article can sit
// in several folders at once (article_folders' PK is (feed_item_id,
// user_id, folder_id)), so this diffs against what's already there rather
// than deleting and re-inserting the whole set — an unchanged folder
// keeps its original created_at.
//
// Filing an article is what saves it: gaining its first folder promotes it
// to state='saved' from any other state. Removing the last folder never
// demotes it, which matches how filing reads to a user ("I put this
// somewhere, so I kept it") without making Save membership fragile.
export async function setArticleFolders(
  feedItemId: string,
  folderIds: string[]
): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const desired = [...new Set(folderIds)]
  const supabase = await createClient()

  const { data: existingRows, error: readError } = await supabase
    .from('article_folders')
    .select('folder_id')
    .eq('user_id', user.id)
    .eq('feed_item_id', feedItemId)
  if (readError) return { error: readError.message }

  const existing = new Set((existingRows ?? []).map((row) => row.folder_id))
  const toAdd = desired.filter((id) => !existing.has(id))
  const toRemove = [...existing].filter((id) => !desired.includes(id))

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('article_folders')
      .delete()
      .eq('user_id', user.id)
      .eq('feed_item_id', feedItemId)
      .in('folder_id', toRemove)
    if (error) return { error: error.message }
  }

  if (toAdd.length > 0) {
    const { error } = await supabase.from('article_folders').insert(
      toAdd.map((folderId) => ({ user_id: user.id, feed_item_id: feedItemId, folder_id: folderId }))
    )
    if (error) return { error: error.message }
  }

  if (desired.length > 0) {
    const { data: state } = await supabase
      .from('article_states')
      .select('state')
      .eq('user_id', user.id)
      .eq('feed_item_id', feedItemId)
      .maybeSingle()
    if (state?.state !== 'saved') {
      const { error } = await supabase.from('article_states').upsert(
        { user_id: user.id, feed_item_id: feedItemId, state: 'saved', archived_at: null },
        { onConflict: 'user_id,feed_item_id' }
      )
      if (error) return { error: error.message }
    }
  }

  revalidatePath('/inbox')
  revalidatePath('/saved')
  revalidatePath('/archive')
  return { error: null }
}
