// Shared between ingest-time filtering (runIngest in ./ingest.ts, applied
// to each new item as it's fetched) and the retroactive "Run rules now"
// sweep (runAutoDeleteRulesNow in src/lib/settings/actions.ts, applied to
// whatever's already sitting in the inbox) — both need to agree on exactly
// what counts as a match.

// Case-insensitive substring match — deliberately simple (no word-boundary
// handling) so "soccer" also catches "soccer-related", matching how a user
// thinks about a blocklist.
export function matchedAutoDeleteKeyword(title: string, keywords: string[]): string | null {
  const lowerTitle = title.toLowerCase()
  for (const keyword of keywords) {
    const needle = keyword.trim().toLowerCase()
    if (needle && lowerTitle.includes(needle)) return keyword
  }
  return null
}
