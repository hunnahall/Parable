// Locale is deliberately left to the browser (`undefined`), so dates render
// in the reader's own regional format rather than a hardcoded one.

// Article dates. `long` spells the month out for the reading view, where
// there's room for it; cards use the short form.
export function formatArticleDate(
  dateString: string | null,
  { long = false }: { long?: boolean } = {}
): string | null {
  if (!dateString) return null
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, {
    month: long ? 'long' : 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// Feed "last fetched" timestamps, which need the time of day to be useful
// and read better as "never" than as a blank when a feed has never run.
export function formatFetchedAt(dateString: string | null): string {
  if (!dateString) return 'never'
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return 'never'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
