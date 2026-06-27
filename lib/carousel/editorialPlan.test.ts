import { describe, it, expect } from 'vitest'
import { planCover, headlineTokens } from './editorialPlan'
import type { CarouselBeat } from './types'
import type { ResolvedDesignSystem } from '@/lib/designSystem/resolveDesignSystem'

const resolved = (style_id: ResolvedDesignSystem['style_id']): ResolvedDesignSystem => ({
  style_id, source: 'profile_default', primary_color: '#FFFFFF', accent: '#FF3B30',
  background: '#0B0B0F', split_image_cover: false,
})
const cover = (over: Partial<CarouselBeat> = {}): CarouselBeat => ({
  beat: 'hook', isCover: true, index: 0, title: 'Stop Creating Carousels', highlightWord: 'Carousels', ...over,
})
const ctx = { topic: 'why your carousels flop', audience: 'creators', handle: 'ravendesigns' }

describe('headlineTokens', () => {
  it('emits one xl token per word and paints the highlight word accent', () => {
    const toks = headlineTokens('Stop Creating Carousels', 'Carousels')
    expect(toks.map(t => t.text)).toEqual(['Stop', 'Creating', 'Carousels'])
    expect(toks.every(t => t.scale === 'xl')).toBe(true)
    expect(toks[0].break).toBe(true)
    expect(toks[2].break).toBeFalsy()
    expect(toks[2].color).toBe('accent')
    expect(toks[0].color).toBe('fg')
  })

  it('matches the highlight word ignoring case and punctuation', () => {
    const toks = headlineTokens('THE COLD OPEN', 'cold')
    expect(toks.find(t => t.text === 'COLD')!.color).toBe('accent')
  })
})

describe('planCover', () => {
  it('returns a Hero plan for bold_personal covers', () => {
    const plan = planCover(cover(), resolved('bold_personal'), ctx)
    expect(plan).not.toBeNull()
    expect(plan!.archetype).toBe('hero')
    expect(plan!.headline.map(t => t.text)).toEqual(['Stop', 'Creating', 'Carousels'])
    expect(plan!.handle).toBe('ravendesigns')
    expect(plan!.subjectPrompt).toMatch(/transparent background/i)
    expect(plan!.subjectPrompt).toMatch(/no text/i)
    expect(plan!.subjectPrompt).toContain('why your carousels flop')
    expect(plan!.bgPrompt).toMatch(/no people|text-free/i)
  })

  it('returns null for styles not yet migrated to an archetype (v1)', () => {
    expect(planCover(cover(), resolved('premium_editorial'), ctx)).toBeNull()
    expect(planCover(cover(), resolved('clean_direct'), ctx)).toBeNull()
  })

  it('returns null for non-cover beats', () => {
    expect(planCover(cover({ isCover: false, beat: 'value', index: 2 }), resolved('bold_personal'), ctx)).toBeNull()
  })
})
