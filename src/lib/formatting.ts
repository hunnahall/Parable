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

// Inbox and Archive times: "now", "12m ago", "3h ago", "2d ago". The windows
// are hours long, so a date says less than an age.
export function formatAge(dateString: string | null, now: number = Date.now()): string | null {
  if (!dateString) return null
  const then = new Date(dateString).getTime()
  if (Number.isNaN(then)) return null
  const minutes = Math.floor(Math.max(0, now - then) / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
