import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Parser from 'rss-parser'
import { stripHtml, translateArticle } from '@/lib/translate'

// Cron-triggered background job, not user-facing — always run fresh,
// and force the Node.js runtime since rss-parser and the Supabase admin
// client both need Node APIs (this also keeps it off any edge runtime
// default).
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const FEED_FETCH_TIMEOUT_MS = 15_000

interface FeedFailure {
  feedId: string
  url: string
  error: string
}

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET
  // Fail closed: if the secret isn't configured, nothing can authenticate.
  if (!expected) return false

  const headerSecret = request.headers.get('x-cron-secret')
  const querySecret = request.nextUrl.searchParams.get('secret')

  return headerSecret === expected || querySecret === expected
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  )
}

async function ingestFeeds(): Promise<{
  feedsProcessed: number
  feedsFailed: FeedFailure[]
  itemsInserted: number
}> {
  const supabase = adminClient()
  const parser = new Parser({ timeout: FEED_FETCH_TIMEOUT_MS })

  const { data: feeds, error: feedsError } = await supabase
    .from('feeds')
    .select('id, url, title')

  if (feedsError) {
    throw new Error(`Failed to load feeds: ${feedsError.message}`)
  }

  let feedsProcessed = 0
  let itemsInserted = 0
  const feedsFailed: FeedFailure[] = []

  for (const feed of feeds ?? []) {
    try {
      const parsed = await parser.parseURL(feed.url)

      // Each RSS item needs a stable identifier to dedupe against. Most
      // feeds set <guid>; a handful only set <link>. If neither is
      // present there's nothing to key the unique (feed_id, guid)
      // constraint on, so that item is unprocessable — skip it rather
      // than risk a null/duplicate guid.
      const items = (parsed.items ?? [])
        .map((item) => ({ item, guid: item.guid ?? item.link ?? null }))
        .filter(
          (entry): entry is { item: (typeof parsed.items)[number]; guid: string } =>
            entry.guid !== null
        )

      let existingGuids = new Set<string>()
      if (items.length > 0) {
        const { data: existing, error: existingError } = await supabase
          .from('feed_items')
          .select('guid')
          .eq('feed_id', feed.id)
          .in(
            'guid',
            items.map((entry) => entry.guid)
          )

        if (existingError) {
          throw new Error(
            `Failed to check existing items: ${existingError.message}`
          )
        }

        existingGuids = new Set((existing ?? []).map((row) => row.guid))
      }

      const newItems = items.filter((entry) => !existingGuids.has(entry.guid))

      const rows: Array<{
        feed_id: string
        guid: string
        title: string
        link: string | null
        summary: string
        published_at: string | null
        original_language: string
        title_en: string | null
        summary_en: string | null
      }> = []

      for (const { item, guid } of newItems) {
        try {
          const rawTitle = item.title ?? ''
          const rawSummary = item.content ?? item.summary ?? item.contentSnippet ?? ''

          // translateArticle() re-strips these same raw strings internally —
          // passing it the same raw HTML that stripHtml() cleans here keeps
          // the stored title/summary and the detected/translated text based
          // on identical input.
          const { original_language, title_en, summary_en } =
            await translateArticle(rawTitle, rawSummary)

          rows.push({
            feed_id: feed.id,
            guid,
            title: stripHtml(rawTitle),
            link: item.link ?? null,
            summary: stripHtml(rawSummary),
            published_at: item.isoDate ?? null,
            original_language,
            title_en,
            summary_en,
          })
        } catch (itemErr) {
          // A single malformed item (missing/garbage fields) shouldn't
          // sink the rest of an otherwise-healthy feed.
          console.error(
            `ingest-feeds: skipping item guid=${guid} in feed ${feed.id} (${feed.url})`,
            itemErr
          )
        }
      }

      if (rows.length > 0) {
        const { error: insertError } = await supabase
          .from('feed_items')
          .insert(rows)

        if (insertError) {
          throw new Error(`Failed to insert items: ${insertError.message}`)
        }
      }

      const { error: updateError } = await supabase
        .from('feeds')
        .update({ last_fetched_at: new Date().toISOString() })
        .eq('id', feed.id)

      if (updateError) {
        throw new Error(
          `Failed to update last_fetched_at: ${updateError.message}`
        )
      }

      feedsProcessed++
      itemsInserted += rows.length
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`ingest-feeds: feed ${feed.id} (${feed.url}) failed:`, message)
      feedsFailed.push({ feedId: feed.id, url: feed.url, error: message })
    }
  }

  return { feedsProcessed, feedsFailed, itemsInserted }
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const summary = await ingestFeeds()
    return NextResponse.json(summary)
  } catch (err) {
    // Only reachable for failures outside the per-feed loop (e.g. the
    // initial `feeds` query itself failing) — per-feed failures are
    // caught above and reported in the response body instead.
    const message = err instanceof Error ? err.message : String(err)
    console.error('ingest-feeds: fatal error', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export { handle as GET, handle as POST }
