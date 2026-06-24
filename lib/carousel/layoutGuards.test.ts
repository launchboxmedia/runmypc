import { describe, it, expect } from 'vitest'
import { checkHookOverflow, HOOK_MAX_CHARS } from './layoutGuards'
import type { CarouselBeat } from './types'

const beat = (over: Partial<CarouselBeat>): CarouselBeat => ({
  beat: 'value', isCover: false, index: 1, title: 'short', ...over,
})

describe('checkHookOverflow', () => {
  it('returns no warnings when all titles are within the cap', () => {
    expect(checkHookOverflow([beat({ title: 'a'.repeat(HOOK_MAX_CHARS) })])).toEqual([])
  })

  it('flags a title over the cap with index/beat/chars', () => {
    const long = 'a'.repeat(HOOK_MAX_CHARS + 1)
    const warnings = checkHookOverflow([beat({ index: 2, beat: 'hook', title: long })])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({ index: 2, beat: 'hook', chars: HOOK_MAX_CHARS + 1 })
  })

  it('reports each overflowing slide independently', () => {
    const long = 'x'.repeat(HOOK_MAX_CHARS + 5)
    const warnings = checkHookOverflow([
      beat({ index: 0, title: 'ok' }),
      beat({ index: 1, title: long }),
      beat({ index: 2, title: long }),
    ])
    expect(warnings.map(w => w.index)).toEqual([1, 2])
  })
})
