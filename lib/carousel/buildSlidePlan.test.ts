import { describe, it, expect } from 'vitest'
import { buildSlidePlan } from './buildSlidePlan'

describe('buildSlidePlan', () => {
  it('normal post (5 body lines) → 7 slides, cover hook first, cta last, 5 middle', () => {
    const plan = buildSlidePlan({
      hook: 'Stop doing this',
      body: 'one\ntwo\nthree\nfour\nfive',
      cta: 'Follow for more',
    })
    expect(plan).toHaveLength(7)
    expect(plan[0]).toMatchObject({ index: 0, beat: 'hook', isCover: true, text: 'Stop doing this' })
    expect(plan[plan.length - 1]).toMatchObject({ beat: 'cta', isCover: false, text: 'Follow for more' })
    expect(plan.slice(1, -1).every(s => s.beat === 'value')).toBe(true)
    expect(plan.slice(1, -1)).toHaveLength(5)
  })

  it('long body (8 lines) → content-driven 10 slides (cover + 8 + cta), not capped at 7', () => {
    const plan = buildSlidePlan({
      hook: 'Hook',
      body: 'b1\nb2\nb3\nb4\nb5\nb6\nb7\nb8',
      cta: 'Go now',
    })
    expect(plan).toHaveLength(10)
    expect(plan.slice(1, -1)).toHaveLength(8)
    expect(plan[0].isCover).toBe(true)
    expect(plan[plan.length - 1].beat).toBe('cta')
  })

  it('caps total slides at the Instagram max of 20', () => {
    const body = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n')
    const plan = buildSlidePlan({ hook: 'H', body, cta: 'C' })
    expect(plan).toHaveLength(20)
    expect(plan[0].isCover).toBe(true)
    expect(plan.slice(1, -1).every(s => s.beat === 'value')).toBe(true)
    expect(plan[plan.length - 1].beat).toBe('cta')
  })

  it('short body (1 line) → total 3 (1 middle), no fabricated copy', () => {
    const plan = buildSlidePlan({ hook: 'H', body: 'only', cta: 'C' })
    expect(plan).toHaveLength(3)
    expect(plan[1]).toMatchObject({ beat: 'value', text: 'only' })
  })

  it('strips bullet glyphs and numbering from middle text', () => {
    const plan = buildSlidePlan({
      hook: 'H',
      body: '• first\n2. second\n✅ third',
      cta: 'C',
    })
    expect(plan[1].text).toBe('first')
    expect(plan[2].text).toBe('second')
    expect(plan[3].text).toBe('third')
  })

  it('never duplicates the cta as a middle beat', () => {
    const plan = buildSlidePlan({ hook: 'H', body: 'a\nb\nFollow for more', cta: 'Follow for more' })
    const middle = plan.slice(1, -1)
    expect(middle.some(s => s.text === 'Follow for more')).toBe(false)
    expect(plan[plan.length - 1].text).toBe('Follow for more')
  })

  it('falls back: empty hook uses first body line; empty cta uses default', () => {
    const plan = buildSlidePlan({ hook: '', body: 'lead\nb\nc', cta: '' })
    expect(plan[0].text).toBe('lead')
    expect(plan[plan.length - 1].text).toBe('Follow for more')
  })
})
