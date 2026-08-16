'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getUser } from '@/lib/supabase/server'

export async function addTask(title: string): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const trimmed = title.trim()
  if (!trimmed) return { error: 'Task title is required' }

  const supabase = await createClient()
  const { error } = await supabase.from('tasks').insert({ user_id: user.id, title: trimmed })
  if (error) return { error: error.message }

  revalidatePath('/')
  return { error: null }
}

export async function toggleTask(id: string, done: boolean): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('tasks')
    .update({ done })
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) return { error: error.message }

  revalidatePath('/')
  return { error: null }
}

export async function removeTask(id: string): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const supabase = await createClient()
  const { error } = await supabase.from('tasks').delete().eq('id', id).eq('user_id', user.id)
  if (error) return { error: error.message }

  revalidatePath('/')
  return { error: null }
}
