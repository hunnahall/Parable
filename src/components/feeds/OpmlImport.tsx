'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { addFeed } from '@/lib/feeds/actions'
import { addCategory } from '@/lib/categories/actions'

interface ParsedFeed {
  url: string
  title: string
  category: string | null
}

// OPML nests feeds inside folder <outline> elements (no xmlUrl of their
// own) with a category-like text/title label — most readers export their
// folder structure this way, so mapping it onto Parable's flat category
// field gives imported feeds a sensible category for free instead of
// dumping everything into Uncategorized.
function parseOpml(xml: string): ParsedFeed[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const feeds: ParsedFeed[] = []

  function walk(node: Element, category: string | null) {
    for (const child of Array.from(node.children)) {
      if (child.tagName.toLowerCase() !== 'outline') continue
      const xmlUrl = child.getAttribute('xmlUrl')
      const label = child.getAttribute('title') || child.getAttribute('text') || ''
      if (xmlUrl) {
        feeds.push({ url: xmlUrl, title: label, category })
      } else {
        walk(child, label || category)
      }
    }
  }

  const body = doc.querySelector('body')
  if (body) walk(body, null)
  return feeds
}

export default function OpmlImport() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{
    added: number
    failed: { url: string; error: string }[]
  } | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const text = await file.text()
    const feeds = parseOpml(text)

    setImporting(true)
    setResult(null)

    // Pre-create any folder-derived categories so the feed's `category`
    // reliably matches a real row in the categories table — otherwise a
    // later edit of the feed (whose <select> is populated from that
    // table) could silently clear the category back to Uncategorized on
    // save, since the imported value wouldn't appear as a valid option.
    const newCategories = [...new Set(feeds.map((f) => f.category).filter((c) => c !== null))]
    for (const category of newCategories) {
      await addCategory(category)
    }

    let added = 0
    const failed: { url: string; error: string }[] = []
    for (const feed of feeds) {
      const outcome = await addFeed({
        url: feed.url,
        title: feed.title,
        category: feed.category,
      })
      if (outcome.error) {
        failed.push({ url: feed.url, error: outcome.error })
      } else {
        added++
      }
    }

    setImporting(false)
    setResult({ added, failed })
    router.refresh()
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".opml,.xml,text/xml,text/x-opml"
        onChange={handleFile}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={importing}
        className="rounded-full border border-border px-4 py-2 text-sm hover:bg-foreground/5 transition-colors disabled:opacity-50"
      >
        {importing ? 'Importing…' : 'Import OPML'}
      </button>
      {result && (
        <div className="text-xs text-muted mt-2">
          <p>
            Imported {result.added} feed{result.added === 1 ? '' : 's'}.
          </p>
          {result.failed.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {result.failed.map((f) => (
                <li key={f.url} className="text-red-600">
                  {f.url}: {f.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
