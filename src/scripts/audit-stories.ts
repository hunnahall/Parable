// Audits DEDUPE_MAX_DISTANCE (src/lib/feeds/ingest.ts) against real story
// groups rather than hand-written pairs.
//
// Run with:
//   npx tsx src/scripts/audit-stories.ts [hours]   (default 24)
//
// Prints two lists over the articles ingested in the window:
//   1. Every story with more than one article, with each article's
//      distance to the story's first one. A wrong merge shows up here.
//   2. Near misses: pairs in different stories closer than 0.25. A story
//      that should have merged shows up here.
// Read both with the threshold in mind: true matches should sit below it,
// near misses that are really the same story argue for raising it, merged
// pairs that aren't argue for lowering it.
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '')
  }
}

const NEAR_MISS_CEILING = 0.25

function cosineDistance(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return normA === 0 || normB === 0 ? 1 : 1 - dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

async function main() {
  loadEnvLocal()
  const hours = Number(process.argv[2] ?? 24)
  const threshold = Number(process.env.DEDUPE_MAX_DISTANCE ?? '0.16')
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  })

  const since = new Date(Date.now() - hours * 3_600_000).toISOString()
  const { data, error } = await supabase
    .from('feed_items')
    .select('id, story_id, title, title_en, created_at, title_embedding, feeds(title)')
    .gte('created_at', since)
    .not('title_embedding', 'is', null)
    .order('created_at')
  if (error) throw new Error(error.message)

  type Row = { id: string; story: string; title: string; feed: string; embedding: number[] }
  const rows: Row[] = (data ?? []).map((r) => ({
    id: r.id,
    story: r.story_id,
    title: r.title_en ?? r.title,
    feed: (r.feeds as unknown as { title: string | null } | null)?.title ?? '?',
    embedding: JSON.parse(r.title_embedding as unknown as string) as number[],
  }))

  console.log(`${rows.length} articles in the last ${hours}h, threshold ${threshold}\n`)

  const byStory = new Map<string, Row[]>()
  for (const row of rows) byStory.set(row.story, [...(byStory.get(row.story) ?? []), row])
  const groups = [...byStory.values()].filter((g) => g.length > 1)
  console.log(`1. Stories with more than one article: ${groups.length}`)
  for (const group of groups) {
    console.log(`\n  ${group[0].title}  [${group[0].feed}]`)
    for (const row of group.slice(1)) {
      console.log(`    ${cosineDistance(group[0].embedding, row.embedding).toFixed(4)}  ${row.title}  [${row.feed}]`)
    }
  }

  const misses: { d: number; a: Row; b: Row }[] = []
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      if (rows[i].story === rows[j].story) continue
      const d = cosineDistance(rows[i].embedding, rows[j].embedding)
      if (d < NEAR_MISS_CEILING) misses.push({ d, a: rows[i], b: rows[j] })
    }
  }
  misses.sort((x, y) => x.d - y.d)
  console.log(`\n2. Near misses under ${NEAR_MISS_CEILING} in different stories: ${misses.length}`)
  for (const { d, a, b } of misses) {
    console.log(`\n  ${d.toFixed(4)}  ${a.title}  [${a.feed}]\n          ${b.title}  [${b.feed}]`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
