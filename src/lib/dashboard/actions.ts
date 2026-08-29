'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getUser } from '@/lib/supabase/server'
import type { WidgetInstance, WidgetType } from './widgets'

export async function saveDashboardLayout(
  widgets: WidgetInstance[]
): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const supabase = await createClient()
  const rows = widgets.map((widget) => ({
    id: widget.id,
    user_id: user.id,
    widget_type: widget.widget_type,
    config: widget.config,
    x: widget.x,
    y: widget.y,
    w: widget.w,
    h: widget.h,
  }))

  // Make this save authoritative for the whole layout, not just an upsert
  // of the given rows: a stale tab that never learned about a widget
  // deleted elsewhere would otherwise resurrect it, since a plain upsert
  // never removes rows missing from its payload.
  const ids = widgets.map((widget) => widget.id)
  const deleteQuery = supabase.from('dashboard_widgets').delete().eq('user_id', user.id)
  const { error: deleteError } =
    ids.length > 0 ? await deleteQuery.not('id', 'in', `(${ids.join(',')})`) : await deleteQuery
  if (deleteError) return { error: deleteError.message }

  if (rows.length > 0) {
    const { error } = await supabase.from('dashboard_widgets').upsert(rows)
    if (error) return { error: error.message }
  }

  revalidatePath('/')
  return { error: null }
}

export async function addWidget(
  widgetType: WidgetType,
  config: Record<string, string>,
  size?: { w: number; h: number }
): Promise<{ widget: WidgetInstance; error: null } | { widget: null; error: string }> {
  const user = await getUser()
  if (!user) return { widget: null, error: 'Not signed in' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('dashboard_widgets')
    .insert({
      user_id: user.id,
      widget_type: widgetType,
      config,
      x: 0,
      y: 0,
      w: size?.w ?? 4,
      h: size?.h ?? 4,
    })
    .select('id, widget_type, config, x, y, w, h')
    .single()

  if (error || !data) return { widget: null, error: error?.message ?? 'Insert failed' }

  revalidatePath('/')
  return { widget: data, error: null }
}

export async function removeWidget(id: string): Promise<{ error: string | null }> {
  const user = await getUser()
  if (!user) return { error: 'Not signed in' }

  const supabase = await createClient()
  const { error } = await supabase.from('dashboard_widgets').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/')
  return { error: null }
}
