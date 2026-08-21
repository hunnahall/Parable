'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getUser } from '@/lib/supabase/server'
import type { KeyDateRow } from './data'

export async function addKeyDate(
  title: string,
  eventDate: string
): Promise<{ keyDate: KeyDateRow; error: null } | { keyDate: null; error: string }> {
  const user = await getUser()
  if (!user) return { keyDate: null, error: 'Not signed in' }

  const trimmed = title.trim()
  if (!trimmed) return { keyDate: null, error: 'Title is required' }
  if (!eventDate) return { keyDate: null, error: 'Date is required' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('key_dates')
    .insert({ user_id: user.id, title: trimmed, event_date: eventDate })
    .select('id, title, event_date, created_at')
    .single()
  if (error || !data) return { keyDate: null, error: error?.message ?? 'Insert failed' }

  revalidatePath('/')
  return { keyDate: data, error: null }
}

export async function removeKeyDate(id: string): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const supabase = await createClient()
  const { error } = await supabase.from('key_dates').delete().eq('id', id).eq('user_id', user.id)
  if (error) return { error: error.message }

  revalidatePath('/')
  return { error: null }
}
