'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getUser } from '@/lib/supabase/server'

export async function addCategory(name: string): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const trimmed = name.trim()
  if (!trimmed) return { error: 'Category name is required' }

  const supabase = await createClient()
  const { error } = await supabase.from('categories').insert({ name: trimmed })
  if (error) return { error: error.message }

  revalidatePath('/feeds')
  return { error: null }
}

export async function removeCategory(name: string): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const supabase = await createClient()

  // Clear the category off any feeds still using it (falls back to
  // "Uncategorized" in the UI) rather than blocking the delete.
  const { error: clearError } = await supabase
    .from('feeds')
    .update({ category: null })
    .eq('category', name)
  if (clearError) return { error: clearError.message }

  const { error } = await supabase.from('categories').delete().eq('name', name)
  if (error) return { error: error.message }

  revalidatePath('/feeds')
  revalidatePath('/')
  return { error: null }
}
