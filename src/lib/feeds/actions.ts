'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getUser } from '@/lib/supabase/server'

export async function addFeed(input: {
  url: string
  title: string
  category: string | null
}): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const url = input.url.trim()
  const title = input.title.trim()
  const category = input.category?.trim() || null

  if (!url || !title) {
    return { error: 'URL and title are required' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('feeds').insert({ url, title, category })

  if (error) return { error: error.message }

  revalidatePath('/feeds')
  return { error: null }
}

export async function updateFeed(
  id: string,
  input: { title: string; category: string | null }
): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const title = input.title.trim()
  const category = input.category?.trim() || null

  if (!title) return { error: 'Title is required' }

  const supabase = await createClient()
  const { error } = await supabase.from('feeds').update({ title, category }).eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/feeds')
  return { error: null }
}

export async function removeFeed(id: string): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const supabase = await createClient()

  // Delete dependent feed_items explicitly rather than relying on an
  // assumed ON DELETE CASCADE on the feed_items.feed_id FK, since this
  // repo has no schema file to confirm that constraint exists.
  const { error: itemsError } = await supabase.from('feed_items').delete().eq('feed_id', id)
  if (itemsError) return { error: itemsError.message }

  const { error } = await supabase.from('feeds').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/feeds')
  revalidatePath('/')
  return { error: null }
}
