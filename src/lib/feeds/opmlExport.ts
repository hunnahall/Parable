import { listFeedsDetailed, type FeedRow } from './data'
import { listCategories } from '@/lib/categories/data'

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function feedOutline(feed: FeedRow, indent: string): string {
  const title = escapeXmlAttr(feed.title || feed.url)
  const url = escapeXmlAttr(feed.url)
  return `${indent}<outline type="rss" text="${title}" title="${title}" xmlUrl="${url}"/>`
}

// Categories are the top-level <outline text="..."> groups, in the user's
// order, each holding its feeds. Import reads the same shape: each top-level
// group becomes a category. Uncategorized feeds sit at the top level.
export async function generateFeedsOpml(): Promise<string> {
  const [feeds, categories] = await Promise.all([listFeedsDetailed(), listCategories()])

  const feedsByCategory = new Map<string, FeedRow[]>()
  const uncategorized: FeedRow[] = []
  for (const feed of feeds) {
    if (!feed.categoryId) {
      uncategorized.push(feed)
      continue
    }
    const list = feedsByCategory.get(feed.categoryId) ?? []
    list.push(feed)
    feedsByCategory.set(feed.categoryId, list)
  }

  const categoryBlocks = categories.map((category) => {
    const name = escapeXmlAttr(category.name)
    const lines = (feedsByCategory.get(category.id) ?? []).map((feed) => feedOutline(feed, '    '))
    return lines.length > 0
      ? `  <outline text="${name}" title="${name}">\n${lines.join('\n')}\n  </outline>`
      : `  <outline text="${name}" title="${name}"/>`
  })
  const uncategorizedLines = uncategorized.map((feed) => feedOutline(feed, '  '))
  const body = [...categoryBlocks, ...uncategorizedLines].join('\n')

  const createdAt = new Date().toUTCString()
  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Parable feeds</title>
    <dateCreated>${createdAt}</dateCreated>
  </head>
  <body>
${body}
  </body>
</opml>
`
}
