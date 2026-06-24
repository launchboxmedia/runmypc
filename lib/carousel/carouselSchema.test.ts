import { describe, it, expect } from 'vitest'
import { validateCarouselBeats } from './carouselSchema'
import type { CarouselBeat } from './types'

const okBeats: CarouselBeat[] = [
  { beat: 'hook', isCover: true, index: 0, title: 'Hook' },
  { beat: 'cta', isCover: false, index: 1, title: 'Act now', automationKeyword: 'RIZE' },
]

describe('validateCarouselBeats', () => {
  it('accepts well-formed beats', () => {
    expect(validateCarouselBeats(okBeats)).not.toBeNull()
  })

  it('accepts optional layout directives', () => {
    const withRails = [...okBeats, { beat: 'value', isCover: false, index: 2, title: 'X', forceContrastMode: 'dark', showSwipeIndicator: true, paginationIndex: 2 }]
    expect(validateCarouselBeats(withRails)).not.toBeNull()
  })

  it('rejects when no hook is present', () => {
    expect(validateCarouselBeats([{ beat: 'cta', isCover: false, index: 0, title: 'X' }])).toBeNull()
  })

  it('rejects a bad contrast mode', () => {
    expect(validateCarouselBeats([{ beat: 'hook', isCover: true, index: 0, title: 'H', forceContrastMode: 'neon' }])).toBeNull()
  })

  it('rejects a blank title', () => {
    expect(validateCarouselBeats([{ beat: 'hook', isCover: true, index: 0, title: '   ' }])).toBeNull()
  })

  it('rejects a non-array', () => {
    expect(validateCarouselBeats({ slides: [] })).toBeNull()
  })
})
