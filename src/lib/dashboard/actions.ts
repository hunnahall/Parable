'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getUser } from '@/lib/supabase/server'
import type { WidgetInstance, WidgetType } from './widgets'

export async function saveDashboardLayout(widgets: WidgetInstance[]) {
  const user = await getUser()
  if (!user) return

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

  await supabase.from('dashboard_widgets').upsert(rows)
  revalidatePath('/')
}

export async function addWidget(
  widgetType: WidgetType,
  config: Record<string, string>
): Promise<WidgetInstance | null> {
  const user = await getUser()
  if (!user) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('dashboard_widgets')
    .insert({
      user_id: user.id,
      widget_type: widgetType,
      config,
      x: 0,
      y: 0,
      w: 4,
      h: 4,
    })
    .select('id, widget_type, config, x, y, w, h')
    .single()

  if (error || !data) return null

  revalidatePath('/')
  return data
}

export async function removeWidget(id: string) {
  const user = await getUser()
  if (!user) return

  const supabase = await createClient()
  await supabase.from('dashboard_widgets').delete().eq('id', id)
  revalidatePath('/')
}
