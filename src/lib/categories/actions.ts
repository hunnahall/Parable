'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getUser } from '@/lib/supabase/server'

function refresh() {
  revalidatePath('/feeds')
  revalidatePath('/inbox')
  revalidatePath('/archive')
}

// A new category goes to the end of the user's order.
export async function addCategory(name: string): Promise<{ id: string | null; error: string | null }> {
  const user = await getUser()
  if (!user) return { id: null, error: 'Not signed in' }

  const trimmed = name.trim()
  if (!trimmed) return { id: null, error: 'Name is required' }

  const supabase = await createClient()
  const { data: last } = await supabase
    .from('categories')
    .select('position')
    .eq('user_id', user.id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await supabase
    .from('categories')
    .insert({ name: trimmed, user_id: user.id, position: (last?.position ?? -1) + 1 })
    .select('id')
    .single()
  if (error) {
    return {
      id: null,
      error: error.code === '23505' ? `You already have a category named ${trimmed}.` : error.message,
    }
  }

  refresh()
  return { id: data.id, error: null }
}

export async function renameCategory(id: string, name: string): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const trimmed = name.trim()
  if (!trimmed) return { error: 'Name is required' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('categories')
    .update({ name: trimmed })
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) {
    return {
      error: error.code === '23505' ? `You already have a category named ${trimmed}.` : error.message,
    }
  }

  refresh()
  return { error: null }
}

// Its feeds stay subscribed and become uncategorized (the foreign key sets
// subscriptions.category_id to null).
export async function removeCategory(id: string): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const supabase = await createClient()
  const { error } = await supabase.from('categories').delete().eq('id', id).eq('user_id', user.id)
  if (error) return { error: error.message }

  refresh()
  return { error: null }
}

// The full order, first to last. Positions are rewritten 0..n-1.
export async function reorderCategories(orderedIds: string[]): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const supabase = await createClient()
  const results = await Promise.all(
    orderedIds.map((id, position) =>
      supabase.from('categories').update({ position }).eq('id', id).eq('user_id', user.id)
    )
  )
  const failed = results.find((r) => r.error)
  if (failed?.error) return { error: failed.error.message }

  refresh()
  return { error: null }
}

// One category per feed; null leaves it uncategorized. Only the user's own
// categories are accepted.
export async function setFeedCategory(
  feedId: string,
  categoryId: string | null
): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('subscriptions')
    .update({ category_id: categoryId })
    .eq('user_id', user.id)
    .eq('feed_id', feedId)
  if (error) return { error: error.message }

  refresh()
  return { error: null }
}

// Finds the user's category by name (case-insensitive) or creates it at the
// end of their order. OPML import calls this once per top-level folder.
export async function ensureCategory(name: string): Promise<string> {
  const user = await getUser()
  if (!user) throw new Error('Not signed in')

  const trimmed = name.trim()
  if (!trimmed) throw new Error('No category name provided')

  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('categories')
    .select('id, name')
    .eq('user_id', user.id)
    .ilike('name', trimmed.replace(/[\\%_]/g, '\\$&'))
    .maybeSingle()
  if (existing) return existing.id

  const created = await addCategory(trimmed)
  if (created.error || !created.id) throw new Error(created.error ?? 'Failed to create category')
  return created.id
}
