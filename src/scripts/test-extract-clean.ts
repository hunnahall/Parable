import Parser from 'rss-parser'
import { JSDOM, VirtualConsole } from 'jsdom'
import { Readability } from '@mozilla/readability'
import { paragraphsOf } from '../lib/articles/extract'

// Smoke test for the article-text cleanup in src/lib/articles/extract.ts
// (roadmap step 10): fetches a few articles per feed, extracts them, and
// prints every paragraph the cleanup dropped, so false positives show up.
// Run: npx tsx src/scripts/test-extract-clean.ts [feed or article URL ...]
const DEFAULT_FEEDS = [
  'https://www.rfi.fr/fr/tag/tunisie/rss',
  'https://feeds.bbci.co.uk/news/world/rss.xml',
  'https://www.aljazeera.net/aljazeerarss/a7c186be-1baa-4bd4-9d80-a84db769f779/73d0e1b4-532f-45ef-b135-bfdff8b8cab9',
  'https://www.france24.com/fr/afrique/rss',
  'https://www.theguardian.com/world/rss',
]
// jsdom logs every stylesheet it can't parse; none of it matters here.
const quiet = new VirtualConsole()
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; ParableBot/1.0)' }

function oldParagraphs(html: string, url: string): string[] {
  const doc = new JSDOM(html, { url }).window.document
  const sel = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, figcaption'
  return Array.from(doc.querySelectorAll(sel)).filter((el) => !el.querySelector(sel))
    .map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean)
}

async function main() {
  const parser = new Parser({ timeout: 15000, headers: UA })
  const args = process.argv.slice(2)
  const feeds = args.length > 0 ? args : DEFAULT_FEEDS
  for (const feedUrl of feeds) {
    // Anything that doesn't parse as a feed is treated as one article URL.
    let items: { link?: string }[] = []
    try { items = (await parser.parseURL(feedUrl)).items } catch { items = [{ link: feedUrl }] }
    for (const item of items.slice(0, 4)) {
      if (!item.link) continue
      try {
        const res = await fetch(item.link, { headers: UA })
        if (!res.ok) { console.log('HTTP', res.status, item.link); continue }
        const html = await res.text()
        const article = new Readability(new JSDOM(html, { url: item.link, virtualConsole: quiet }).window.document).parse()
        if (!article?.content) { console.log('NO CONTENT', item.link); continue }
        const before = oldParagraphs(article.content, item.link)
        const after = paragraphsOf(article.content, item.link).split('\n\n').filter(Boolean)
        const kept = new Set(after)
        const dropped = before.filter((p) => !kept.has(p))
        console.log(`\n== ${item.link}\n   ${before.length} -> ${after.length} paragraphs`)
        for (const d of dropped) console.log('   DROP:', d.slice(0, 140))
      } catch (e) { console.log('ERR', item.link, String(e).slice(0, 80)) }
    }
  }
}
main()
