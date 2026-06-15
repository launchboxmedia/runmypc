export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number
    delayMs?: number
    backoffMultiplier?: number
    onRetry?: (attempt: number, error: Error) => void
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    delayMs = 2000,
    backoffMultiplier = 2,
    onRetry
  } = options

  let lastError: Error = new Error('Unknown error')

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))

      if (attempt === maxAttempts) break

      const delay = delayMs * Math.pow(backoffMultiplier, attempt - 1)
      onRetry?.(attempt, lastError)

      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError
}
