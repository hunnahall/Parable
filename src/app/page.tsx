import { redirect } from 'next/navigation'
import { createClient, getUser } from '@/lib/supabase/server'
import {
  getHeadlinesData,
  getFeedData,
  getIndicatorsData,
  getSavedArticlesData,
  listFeeds,
  listIndicators,
} from '@/lib/dashboard/data'
import { getDefaultLayout, type WidgetInstance } from '@/lib/dashboard/widgets'
import type { DashboardWidgetData } from '@/lib/dashboard/types'
import DashboardGrid from '@/components/dashboard/DashboardGrid'

export default async function Home() {
  const user = await getUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data: savedWidgets } = await supabase
    .from('dashboard_widgets')
    .select('id, widget_type, config, x, y, w, h')
    .eq('user_id', user.id)

  const widgets: WidgetInstance[] =
    savedWidgets && savedWidgets.length > 0 ? savedWidgets : getDefaultLayout()

  const feedIds = [
    ...new Set(
      widgets.filter((w) => w.widget_type === 'feed').map((w) => w.config.feed_id)
    ),
  ].filter(Boolean)
  const indicatorIds = [
    ...new Set(
      widgets
        .filter((w) => w.widget_type === 'indicators')
        .map((w) => w.config.indicator_id)
    ),
  ].filter(Boolean)
  const needsHeadlines = widgets.some((w) => w.widget_type === 'headlines')
  const needsSaved = widgets.some((w) => w.widget_type === 'saved')

  const [headlines, feedEntries, indicatorEntries, saved, feedOptions, indicatorOptions] =
    await Promise.all([
      needsHeadlines ? getHeadlinesData() : Promise.resolve([]),
      Promise.all(feedIds.map(async (id) => [id, await getFeedData(id)] as const)),
      Promise.all(
        indicatorIds.map(async (id) => [id, await getIndicatorsData(id)] as const)
      ),
      needsSaved ? getSavedArticlesData() : Promise.resolve([]),
      listFeeds(),
      listIndicators(),
    ])

  const widgetData: DashboardWidgetData = {
    headlines,
    feeds: Object.fromEntries(feedEntries),
    indicators: Object.fromEntries(indicatorEntries),
    saved,
  }

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold mb-4">Dashboard</h1>
      <DashboardGrid
        initialWidgets={widgets}
        widgetData={widgetData}
        feedOptions={feedOptions}
        indicatorOptions={indicatorOptions}
      />
    </div>
  )
}
