export type WidgetType = 'headlines' | 'indicators' | 'feed'

export interface WidgetInstance {
  id: string
  widget_type: WidgetType
  config: Record<string, string>
  x: number
  y: number
  w: number
  h: number
}

export const WIDGET_LABELS: Record<WidgetType, string> = {
  headlines: 'Latest headlines',
  feed: 'Single feed',
  indicators: 'Economic indicator',
}

// Shown when a signed-in user has no saved dashboard_widgets rows yet.
// Not persisted until the user actually drags, resizes, adds, or removes
// something — see saveDashboardLayout in ./actions, which upserts on `id`,
// so these need real ids ready to become row ids the first time that happens.
export function getDefaultLayout(): WidgetInstance[] {
  return [
    {
      id: crypto.randomUUID(),
      widget_type: 'headlines',
      config: {},
      x: 0,
      y: 0,
      w: 6,
      h: 6,
    },
  ]
}
