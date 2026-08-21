export type WidgetType =
  | 'headlines'
  | 'indicators'
  | 'feed'
  | 'saved'
  | 'feed-category'
  | 'clock'
  | 'calendar'
  | 'todo'
  | 'watchlist'
  | 'key-dates'

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
  saved: 'Saved articles',
  'feed-category': 'Feeds by category',
  clock: 'Clock',
  calendar: 'Calendar',
  todo: 'To-do list',
  watchlist: 'Indicator watchlist',
  'key-dates': 'Key dates',
}

// Sizing hints for addWidget when a widget type wants something other
// than the generic 4x4 default (e.g. a clock reads better roughly square,
// a calendar needs more vertical room).
export const WIDGET_DEFAULT_SIZE: Partial<Record<WidgetType, { w: number; h: number }>> = {
  clock: { w: 3, h: 3 },
  calendar: { w: 4, h: 5 },
  watchlist: { w: 6, h: 5 },
  'key-dates': { w: 4, h: 5 },
}

// Shown when a signed-in user has no saved dashboard_widgets rows yet.
// Not persisted until the user actually drags, resizes, adds, or removes
// something — see saveDashboardLayout in ./actions, which upserts on `id`,
// so these need real ids ready to become row ids the first time that happens.
//
// The id is a fixed constant rather than crypto.randomUUID(): a brand-new
// user opening two tabs before ever saving would otherwise have each tab
// compute its own random id for "the same" default widget, so the first
// save from each tab would insert two separate rows instead of one.
const DEFAULT_HEADLINES_WIDGET_ID = '00000000-0000-4000-8000-000000000001'

export function getDefaultLayout(): WidgetInstance[] {
  return [
    {
      id: DEFAULT_HEADLINES_WIDGET_ID,
      widget_type: 'headlines',
      config: {},
      x: 0,
      y: 0,
      w: 6,
      h: 6,
    },
  ]
}
