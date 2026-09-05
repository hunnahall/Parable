// Shared by every keyword-matching path in the app so they can't drift:
// ingest-time filtering (runIngest in ./ingest.ts), the retroactive "Run
// filters now" sweep (runAutoDeleteRulesNow in src/lib/settings/actions.ts),
// and the Rules block's automatic filing (src/lib/filters/rules.ts).

// Case-insensitive substring match — deliberately simple (no word-boundary
// handling) so "soccer" also catches "soccer-related", matching how a user
// thinks about a keyword list.
export function matchesKeyword(title: string, keyword: string): boolean {
  const needle = keyword.trim().toLowerCase()
  return needle.length > 0 && title.toLowerCase().includes(needle)
}

export function matchedAutoDeleteKeyword(title: string, keywords: string[]): string | null {
  for (const keyword of keywords) {
    if (matchesKeyword(title, keyword)) return keyword
  }
  return null
}
