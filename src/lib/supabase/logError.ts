// A read query's Supabase error was previously discarded everywhere (only
// `data` was destructured), so a real query failure — an expired session,
// an RLS denial — rendered identically to "no rows," with nothing in the
// logs to tell the two apart. This doesn't change behavior (callers still
// fall back to an empty/null result so the UI degrades gracefully), it
// just makes a real failure visible server-side instead of silent.
export function logQueryError(context: string, error: { message: string } | null): void {
  if (error) console.error(`${context}: ${error.message}`)
}
