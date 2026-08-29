import { createClient, getUser } from '@/lib/supabase/server'
import {
  getHeadlinesData,
  getFeedData,
  getSavedArticlesData,
  getFeedCategoryData,
  listFeeds,
} from '@/lib/dashboard/data'
import { listCategories } from '@/lib/categories/data'
import { getDefaultLayout, type WidgetInstance } from '@/lib/dashboard/widgets'
import type { DashboardWidgetData } from '@/lib/dashboard/types'
import DashboardGrid from '@/components/dashboard/DashboardGrid'
import LandingPage from '@/components/landing/LandingPage'
import ParableLogo from '@/components/brand/ParableLogo'
import CovenantWorksCredit from '@/components/brand/CovenantWorksCredit'

export default async function Home() {
  const user = await getUser()
  if (!user) return <LandingPage />

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
  const widgetCategories = [
    ...new Set(
      widgets.filter((w) => w.widget_type === 'feed-category').map((w) => w.config.category)
    ),
  ].filter(Boolean)
  const needsHeadlines = widgets.some((w) => w.widget_type === 'headlines')
  const needsSaved = widgets.some((w) => w.widget_type === 'saved')

  const [headlines, feedEntries, saved, categoryEntries, feedOptions, categoryOptions] =
    await Promise.all([
      needsHeadlines ? getHeadlinesData() : Promise.resolve([]),
      Promise.all(feedIds.map(async (id) => [id, await getFeedData(id)] as const)),
      needsSaved ? getSavedArticlesData() : Promise.resolve([]),
      Promise.all(
        widgetCategories.map(async (cat) => [cat, await getFeedCategoryData(cat)] as const)
      ),
      listFeeds(),
      listCategories(),
    ])

  const widgetData: DashboardWidgetData = {
    headlines,
    feeds: Object.fromEntries(feedEntries),
    saved,
    feedCategories: Object.fromEntries(categoryEntries),
  }

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <h1 className="sr-only">Dashboard</h1>
      <div className="mb-6 flex justify-end">
        <ParableLogo height={64} />
      </div>
      <DashboardGrid
        initialWidgets={widgets}
        widgetData={widgetData}
        feedOptions={feedOptions}
        categoryOptions={categoryOptions}
      />
      <CovenantWorksCredit />
    </div>
  )
}
