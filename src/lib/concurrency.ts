// Runs `fn` over `items` with at most `limit` calls in flight at once.
// Order of results matches `items`; order of completion doesn't.
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0
  async function worker() {
    for (;;) {
      const i = nextIndex++
      if (i >= items.length) return
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
}
