// Shared by every keyword-matching path in the app so they can't drift:
// ingest-time filtering (runIngest in ./ingest.ts), the retroactive "Run
// filters now" sweep (runAutoDeleteRulesNow in src/lib/settings/actions.ts).

// Case-insensitive whole-word match, so "war" catches "war" and "civil war"
// but not "award" or "warm". A keyword can be a phrase. Letters and digits
// in any script count as word characters, so this holds for translated and
// untranslated titles alike; hyphens and apostrophes don't, so "soccer" still
// matches "soccer-related".
const patternCache = new Map<string, RegExp | null>()

function keywordPattern(keyword: string): RegExp | null {
  const needle = keyword.trim().toLowerCase()
  if (patternCache.has(needle)) return patternCache.get(needle) ?? null
  const pattern =
    needle.length > 0
      ? new RegExp(
          `(?<![\\p{L}\\p{N}])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}(?![\\p{L}\\p{N}])`,
          'iu'
        )
      : null
  patternCache.set(needle, pattern)
  return pattern
}

export function matchesKeyword(title: string, keyword: string): boolean {
  return keywordPattern(keyword)?.test(title) ?? false
}

export function matchedAutoDeleteKeyword(title: string, keywords: string[]): string | null {
  for (const keyword of keywords) {
    if (matchesKeyword(title, keyword)) return keyword
  }
  return null
}
