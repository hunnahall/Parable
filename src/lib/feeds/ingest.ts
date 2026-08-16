import { createClient } from '@supabase/supabase-js'
import Parser from 'rss-parser'
import { stripHtml, translateArticle } from '@/lib/translate'
import { summarizeArticle } from '@/lib/summarize'

const FEED_FETCH_TIMEOUT_MS = 15_000

export interface FeedFailure {
  feedId: string
  url: string
  error: string
}

export interface IngestSummary {
  feedsProcessed: number
  feedsFailed: FeedFailure[]
  itemsInserted: number
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  )
}

// Shared by the cron-triggered /api/ingest-feeds route and the "Run ingest
// now" button in the feeds management UI (src/lib/feeds/actions.ts), so
// both paths run the exact same logic instead of drifting apart.
export async function runIngest(): Promise<IngestSummary> {
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

      let itemsInsertedForFeed = 0

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

          const summary_ai = await summarizeArticle(
            title_en ?? stripHtml(rawTitle),
            summary_en ?? stripHtml(rawSummary)
          )

          // Insert each item as soon as it's processed rather than
          // buffering the whole feed's rows in memory for one bulk insert
          // at the end of the loop — a large or first-time feed can have
          // enough new items that a mid-run crash/timeout (each item pays
          // for up to two sequential OpenAI calls) would otherwise discard
          // every already-processed item for this feed, and re-pay for the
          // same OpenAI calls on the next run.
          //
          // upsert + ignoreDuplicates rather than a plain insert: if this
          // run overlaps another (cron firing while "Run ingest now" is
          // also mid-flight for the same feed), both can pass the
          // existingGuids check above for the same new item before either
          // has inserted. A plain insert would then fail on the (feed_id,
          // guid) unique constraint; ignoring the duplicate instead just
          // no-ops that one row.
          const { error: insertError } = await supabase.from('feed_items').upsert(
            {
              feed_id: feed.id,
              guid,
              title: stripHtml(rawTitle),
              link: item.link ?? null,
              summary: stripHtml(rawSummary),
              published_at: item.isoDate ?? null,
              original_language,
              title_en,
              summary_en,
              summary_ai,
            },
            { onConflict: 'feed_id,guid', ignoreDuplicates: true }
          )

          if (insertError) {
            throw new Error(`Failed to insert item: ${insertError.message}`)
          }

          itemsInsertedForFeed++
        } catch (itemErr) {
          // A single malformed item (missing/garbage fields) or a one-off
          // insert failure shouldn't sink the rest of an otherwise-healthy
          // feed.
          console.error(
            `ingest-feeds: skipping item guid=${guid} in feed ${feed.id} (${feed.url})`,
            itemErr
          )
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
      itemsInserted += itemsInsertedForFeed
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`ingest-feeds: feed ${feed.id} (${feed.url}) failed:`, message)
      feedsFailed.push({ feedId: feed.id, url: feed.url, error: message })
    }
  }

  return { feedsProcessed, feedsFailed, itemsInserted }
}
