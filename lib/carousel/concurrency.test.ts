import { describe, it, expect } from 'vitest'
import { mapWithConcurrency } from './concurrency'

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

describe('mapWithConcurrency', () => {
  it('preserves input order regardless of completion order', async () => {
    const items = [50, 10, 30, 5]
    const out = await mapWithConcurrency(items, 2, async (n) => {
      await delay(n)
      return n * 2
    })
    expect(out).toEqual([100, 20, 60, 10])
  })

  it('never runs more than `limit` at once', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const items = Array.from({ length: 12 }, (_, i) => i)
    await mapWithConcurrency(items, 3, async (i) => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await delay(10)
      inFlight--
      return i
    })
    expect(maxInFlight).toBeLessThanOrEqual(3)
    expect(maxInFlight).toBeGreaterThan(1) // actually parallelized
  })

  it('treats limit <= 0 as serial (1 at a time)', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const out = await mapWithConcurrency([1, 2, 3], 0, async (n) => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await delay(5)
      inFlight--
      return n
    })
    expect(maxInFlight).toBe(1)
    expect(out).toEqual([1, 2, 3])
  })

  it('rejects if any item rejects', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('boom')
        return n
      })
    ).rejects.toThrow('boom')
  })

  it('handles an empty list', async () => {
    expect(await mapWithConcurrency([], 4, async (n) => n)).toEqual([])
  })
})
