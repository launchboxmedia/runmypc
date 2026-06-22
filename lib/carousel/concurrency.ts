// Run an async mapper over items with a bounded number of promises in flight.
// Results preserve input order. The first rejection rejects the whole call
// (fail-fast), matching a plain sequential loop's behavior.
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  const max = Math.max(1, Math.floor(limit) || 1)
  let next = 0

  async function worker(): Promise<void> {
    while (true) {
      const i = next++
      if (i >= items.length) return
      results[i] = await fn(items[i], i)
    }
  }

  const workers = Array.from({ length: Math.min(max, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}
