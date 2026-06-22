import { describe, it, expect } from 'vitest'
import { stripLoneSurrogates, clip } from './sanitizeUnicode'

describe('stripLoneSurrogates', () => {
  it('keeps valid emoji (surrogate pairs) intact', () => {
    const s = 'hi 🚀 there 😀'
    expect(stripLoneSurrogates(s)).toBe(s)
  })

  it('removes a lone high surrogate (split emoji)', () => {
    const loneHigh = 'speed\uD83D' // high surrogate with no low
    expect(stripLoneSurrogates(loneHigh)).toBe('speed')
  })

  it('removes a lone low surrogate', () => {
    const loneLow = '\uDE00fast' // low surrogate with no high
    expect(stripLoneSurrogates(loneLow)).toBe('fast')
  })

  it('keeps ordinary text and is a no-op for non-strings-coerced input', () => {
    expect(stripLoneSurrogates('plain ascii')).toBe('plain ascii')
  })
})

describe('clip', () => {
  it('clips to n chars and removes a surrogate split at the boundary', () => {
    // '🚀' is two UTF-16 units; clipping to length 1 would split it.
    const out = clip('🚀rocket', 1)
    expect(out).toBe('') // the split high surrogate is stripped
  })

  it('clips normally when the boundary is clean', () => {
    expect(clip('hello world', 5)).toBe('hello')
  })

  it('handles emoji that fits within the limit', () => {
    expect(clip('ab🚀', 4)).toBe('ab🚀')
  })

  it('coerces non-string input safely', () => {
    expect(clip(undefined as unknown as string, 5)).toBe('')
    expect(clip(123 as unknown as string, 2)).toBe('12')
  })
})
