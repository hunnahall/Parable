// Calibrates DEDUPE_MAX_DISTANCE (src/lib/feeds/ingest.ts) — the cosine
// distance under which ingest treats two articles as the same story and
// reuses one summary for both, skipping the other's fetch and
// summarization call.
//
// Run with:
//   npx tsx src/scripts/test-dedupe-threshold.ts
//
// The threshold cannot be reasoned out from first principles: it depends
// on the embedding model, the dimension count, and how the headlines in
// your own feed list are actually written. So this embeds pairs that
// SHOULD merge and pairs that must NOT, prints every distance, and reports
// whether a single threshold separates them.
//
// The pairs that must not merge are the point. "Central Bank Raises Rates"
// and "Central Bank Holds Rates Steady" are lexically almost identical and
// mean opposite things; a threshold loose enough to swallow that one would
// staple the wrong summary onto a real article, and the body is discarded
// at ingest so there is no recovering from it. Add pairs from your own
// feeds here before moving the threshold.
//
// Also checks the plumbing this is useless without: that a number[]
// embedding survives supabase-js -> PostgREST -> vector(512) intact.
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { embedTexts, EMBEDDING_DIMENSIONS } from '../lib/embeddings'

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local')
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const i = trimmed.indexOf('=')
    if (i === -1) continue
    const key = trimmed.slice(0, i)
    if (!(key in process.env)) process.env[key] = trimmed.slice(i + 1)
  }
}
loadEnvLocal()

// Grouped so the report can say whether each pair SHOULD merge.
const pairs: { label: string; shouldMerge: boolean; a: string; b: string }[] = [
  {
    label: 'Same wire story, two outlets rewording the headline',
    shouldMerge: true,
    a: 'OPEC Announces 2% Oil Production Cut Starting January',
    b: 'OPEC to Cut Oil Output by 2% From January',
  },
  {
    label: 'Same story, French original vs English original (both post-translation)',
    shouldMerge: true,
    a: 'The Central Bank Raises Its Key Rates',
    b: 'Central Bank Raises Interest Rates',
  },
  {
    label: 'Same event, one headline leads with a detail the other omits',
    shouldMerge: true,
    a: 'Tunisia Signs Energy Deal With Italy Worth 1 Billion Euros',
    b: 'Tunisia and Italy Sign Billion-Euro Energy Agreement',
  },
  {
    label: 'DIFFERENT stories, same topic and vocabulary',
    shouldMerge: false,
    a: 'Central Bank Raises Interest Rates',
    b: 'Central Bank Holds Interest Rates Steady',
  },
  {
    label: 'DIFFERENT stories, same country and beat',
    shouldMerge: false,
    a: 'Tunisia Signs Energy Deal With Italy',
    b: 'Tunisia Announces New Water Rationing Measures',
  },
  {
    label: 'DIFFERENT stories, same institution different subject',
    shouldMerge: false,
    a: 'OPEC Announces Oil Production Cut',
    b: 'OPEC Names New Secretary General',
  },
]

function cosineDistance(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return 1 - dot / (Math.sqrt(na) * Math.sqrt(nb))
}

async function main() {
  const texts = pairs.flatMap((p) => [p.a, p.b])
  const embeddings = await embedTexts(texts)

  if (embeddings.some((e) => e === null)) {
    console.error('FAIL: some embeddings came back null')
    process.exitCode = 1
    return
  }
  const dims = new Set(embeddings.map((e) => e!.length))
  console.log(
    `✓ ${embeddings.length} embeddings, dimensions ${[...dims].join('/')} ` +
      `(expected ${EMBEDDING_DIMENSIONS})\n`
  )
  if (dims.size !== 1 || !dims.has(EMBEDDING_DIMENSIONS)) {
    console.error('FAIL: unexpected dimensionality')
    process.exitCode = 1
  }

  console.log('Cosine distances (lower = more similar):\n')
  let maxShouldMerge = 0
  let minShouldNotMerge = Infinity
  pairs.forEach((pair, i) => {
    const d = cosineDistance(embeddings[i * 2]!, embeddings[i * 2 + 1]!)
    if (pair.shouldMerge) maxShouldMerge = Math.max(maxShouldMerge, d)
    else minShouldNotMerge = Math.min(minShouldNotMerge, d)
    console.log(`  ${d.toFixed(4)}  ${pair.shouldMerge ? 'MERGE    ' : 'DISTINCT '} ${pair.label}`)
  })

  console.log(
    `\nWidest duplicate:      ${maxShouldMerge.toFixed(4)}` +
      `\nClosest non-duplicate: ${minShouldNotMerge.toFixed(4)}`
  )
  if (maxShouldMerge < minShouldNotMerge) {
    const mid = (maxShouldMerge + minShouldNotMerge) / 2
    console.log(`Separable. Any threshold in (${maxShouldMerge.toFixed(4)}, ${minShouldNotMerge.toFixed(4)}) works; midpoint ${mid.toFixed(4)}.`)
  } else {
    console.log('NOT separable on these samples — no single threshold is safe.')
  }

  // The serialization question: does JSON.stringify(number[]) reach a
  // vector(512) parameter intact through PostgREST?
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  )
  const { error } = await supabase.rpc('find_similar_recent_feed_item', {
    p_embedding: JSON.stringify(embeddings[0]),
    p_max_distance: 0.08,
    p_since: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
  })
  if (error) {
    console.error(`\nFAIL: RPC rejected the embedding — ${error.message}`)
    process.exitCode = 1
  } else {
    console.log('\n✓ RPC accepted a JSON-stringified embedding as vector(512)')
  }
}

main()
