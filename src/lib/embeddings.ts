import OpenAI from 'openai'

const MODEL = 'text-embedding-3-small'
const REQUEST_TIMEOUT_MS = 15_000

// text-embedding-3-small is trained so its dimensions can be truncated
// (Matryoshka) without retraining. 512 keeps the pgvector column and its
// HNSW index a third the size of the full 1536 while staying far more than
// enough for the only question asked of it: "is this the same headline?"
// Must match the vector(512) column in the feed_item_embeddings migration —
// pgvector rejects a mismatched dimension outright.
export const EMBEDDING_DIMENSIONS = 512

// The embeddings endpoint takes an array natively, so a whole feed's
// titles cost one request. At ~15 tokens a headline and $0.02/1M, this
// path is effectively free — it exists to avoid paying for a summarize
// call on a story that has already been summarized from another source.
const EMBED_BATCH_SIZE = 128

let client: OpenAI | null = null
function openai(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  if (!client) client = new OpenAI({ apiKey, timeout: REQUEST_TIMEOUT_MS })
  return client
}

// Returns an array the same length and order as `texts`. Entries that
// couldn't be embedded come back null; callers treat that as "no duplicate
// check possible for this item" and fall through to summarizing it, so a
// failure here costs money rather than correctness.
export async function embedTexts(texts: string[]): Promise<(number[] | null)[]> {
  const results: (number[] | null)[] = new Array(texts.length).fill(null)
  if (texts.length === 0) return results

  const api = openai()
  if (!api) {
    console.error('embeddings: OPENAI_API_KEY not set, skipping embeddings')
    return results
  }

  // The API rejects an empty string, and an item with no title has nothing
  // to match on anyway.
  const entries = texts
    .map((text, index) => ({ index, text: text.trim() }))
    .filter((entry) => entry.text.length > 0)

  for (let i = 0; i < entries.length; i += EMBED_BATCH_SIZE) {
    const batch = entries.slice(i, i + EMBED_BATCH_SIZE)
    try {
      const response = await api.embeddings.create({
        model: MODEL,
        dimensions: EMBEDDING_DIMENSIONS,
        input: batch.map((entry) => entry.text),
      })
      // The response carries its own `index` into the input array; trust
      // that rather than the array order it happens to arrive in.
      for (const item of response.data) {
        const entry = batch[item.index]
        if (entry) results[entry.index] = item.embedding
      }
    } catch (err) {
      console.error(`embeddings: request failed for ${batch.length} titles`, err)
    }
  }

  return results
}
