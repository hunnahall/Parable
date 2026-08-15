'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getUser } from '@/lib/supabase/server'

// Only FRED is wired up in /api/cron/fetch-indicators today (see the
// comment at the top of that file) — EIA's v2 API needs a real series to
// design against, so it isn't offered here yet even though the schema
// would technically allow it.
export async function addIndicator(input: {
  series_code: string
  display_name: string
}): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const series_code = input.series_code.trim()
  const display_name = input.display_name.trim()

  if (!series_code || !display_name) {
    return { error: 'Series code and display name are required' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('indicators')
    .insert({ source: 'FRED', series_code, display_name })

  if (error) return { error: error.message }

  revalidatePath('/indicators')
  return { error: null }
}

export async function updateIndicator(
  id: string,
  input: { display_name: string }
): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const display_name = input.display_name.trim()
  if (!display_name) return { error: 'Display name is required' }

  const supabase = await createClient()
  const { error } = await supabase.from('indicators').update({ display_name }).eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/indicators')
  return { error: null }
}

export async function removeIndicator(id: string): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const supabase = await createClient()

  const { error: readingsError } = await supabase
    .from('indicator_readings')
    .delete()
    .eq('indicator_id', id)
  if (readingsError) return { error: readingsError.message }

  const { error } = await supabase.from('indicators').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/indicators')
  revalidatePath('/')
  return { error: null }
}
