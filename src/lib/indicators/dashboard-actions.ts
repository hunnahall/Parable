'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getUser } from '@/lib/supabase/server'

export async function addIndicatorToDashboard(
  indicatorId: string
): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const supabase = await createClient()
  const { data: maxRow, error: maxError } = await supabase
    .from('user_widgets')
    .select('position')
    .eq('user_id', user.id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (maxError) return { error: maxError.message }

  const nextPosition = (maxRow?.position ?? -1) + 1

  const { error } = await supabase
    .from('user_widgets')
    .insert({ user_id: user.id, indicator_id: indicatorId, position: nextPosition })
  if (error) return { error: error.message }

  revalidatePath('/indicators')
  return { error: null }
}

export async function removeFromDashboard(id: string): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('user_widgets')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) return { error: error.message }

  revalidatePath('/indicators')
  return { error: null }
}

// Bulk position update only — never touches indicator_id/size, matching
// the fixed-size/order-only nature of this dashboard (plan §6).
export async function reorderDashboard(orderedIds: string[]): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const supabase = await createClient()
  const updates = orderedIds.map((id, position) =>
    supabase.from('user_widgets').update({ position }).eq('id', id).eq('user_id', user.id)
  )
  const results = await Promise.all(updates)
  const failed = results.find((r) => r.error)
  if (failed?.error) return { error: failed.error.message }

  revalidatePath('/indicators')
  return { error: null }
}
