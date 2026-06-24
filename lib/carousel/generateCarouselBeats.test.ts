import { describe, it, expect, vi } from 'vitest'
import {
  generateCarouselBeats,
  parseBeatResponse,
  bindAutomationKeyword,
  buildSystemPrompt,
  buildUserPrompt,
  type BeatsInput,
} from './generateCarouselBeats'

const SAMPLE_INPUT: BeatsInput = {
  topic: 'credit repair',
  audience: 'People with low credit scores who want to buy a house',
  outcome: 'Clean credit profile and transparent process',
  researchContext: 'Reddit posts show people frustrated by collections, errors on reports, want step-by-step guidance',
  stance: 'destroy',
  ctaObjective: 'automation',
  automationKeyword: 'RIZE',
}

const VALID_BEATS_JSON = JSON.stringify({
  slides: [
    { beat: 'hook', title: 'Your Credit Report Is Lying to You' },
    { beat: 'problem', title: 'Bad Marks Keep You Stuck', subhead: 'Collections. Errors. Outdated accounts.' },
    { beat: 'value', title: 'Step 1: Pull All 3 Reports', bullets: ['AnnualCreditReport.com', 'Free once per year', 'Equifax, Experian, TransUnion'] },
    { beat: 'value', title: 'Step 2: Find What Hurts You', calloutBox: 'Every negative item has an expiration date' },
    { beat: 'payoff', title: '+326 Points in 7 Weeks', subhead: '26 deletions. Every bureau moved.' },
    { beat: 'cta', title: 'Start Your Credit Audit Today', bottomAnchor: 'Follow @creditrize for the breakdown' },
  ]
})

describe('parseBeatResponse', () => {
  it('returns null for invalid JSON', () => {
    expect(parseBeatResponse('not json')).toBeNull()
  })

  it('returns null when slides is missing or empty', () => {
    expect(parseBeatResponse('{}')).toBeNull()
    expect(parseBeatResponse('{"slides":[]}')).toBeNull()
  })

  it('returns null when hook slide is missing', () => {
    const noHook = JSON.stringify({ slides: [{ beat: 'cta', title: 'Follow us' }] })
    expect(parseBeatResponse(noHook)).toBeNull()
  })

  it('parses valid response and assigns index/isCover', () => {
    const beats = parseBeatResponse(VALID_BEATS_JSON)
    expect(beats).not.toBeNull()
    expect(beats![0].beat).toBe('hook')
    expect(beats![0].isCover).toBe(true)
    expect(beats![0].index).toBe(0)
    expect(beats![1].isCover).toBe(false)
    expect(beats![1].index).toBe(1)
  })

  it('enforces 12-slide cap (truncates excess)', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      i === 0 ? { beat: 'hook', title: 'Hook' } :
      i === 19 ? { beat: 'cta', title: 'CTA' } :
      { beat: 'value', title: `Value ${i}` }
    )
    const beats = parseBeatResponse(JSON.stringify({ slides: many }))
    expect(beats!.length).toBeLessThanOrEqual(12)
    expect(beats![beats!.length - 1].beat).toBe('cta')
  })

  it('preserves optional fields when present', () => {
    const beats = parseBeatResponse(VALID_BEATS_JSON)!
    const valueBeat = beats.find(b => b.beat === 'value' && b.bullets)!
    expect(valueBeat.bullets).toEqual(['AnnualCreditReport.com', 'Free once per year', 'Equifax, Experian, TransUnion'])
  })

  it('strips slides with missing or blank title', () => {
    const withBlank = JSON.stringify({
      slides: [
        { beat: 'hook', title: 'Hook' },
        { beat: 'value', title: '' },
        { beat: 'cta', title: 'CTA' },
      ]
    })
    const beats = parseBeatResponse(withBlank)!
    expect(beats.every(b => b.title.trim().length > 0)).toBe(true)
  })
})

describe('generateCarouselBeats', () => {
  it('returns parsed beats from LLM response', async () => {
    const mockGenerate = vi.fn().mockResolvedValue(VALID_BEATS_JSON)
    const beats = await generateCarouselBeats(SAMPLE_INPUT, { generate: mockGenerate })
    expect(beats.length).toBeGreaterThanOrEqual(3)
    expect(beats[0].beat).toBe('hook')
    expect(beats[0].isCover).toBe(true)
    expect(beats[beats.length - 1].beat).toBe('cta')
  })

  it('uses fallback beats when LLM returns invalid JSON', async () => {
    const mockGenerate = vi.fn().mockResolvedValue('garbage response')
    const beats = await generateCarouselBeats(SAMPLE_INPUT, { generate: mockGenerate })
    expect(beats.length).toBeGreaterThanOrEqual(3)
    expect(beats[0].beat).toBe('hook')
    expect(beats[beats.length - 1].beat).toBe('cta')
  })

  it('uses fallback beats when LLM throws', async () => {
    const mockGenerate = vi.fn().mockRejectedValue(new Error('API error'))
    const beats = await generateCarouselBeats(SAMPLE_INPUT, { generate: mockGenerate })
    expect(beats[0].beat).toBe('hook')
  })

  it('binds the user automation keyword onto the CTA, overriding the model', async () => {
    // Model invents "CREDIT AUDIT" — the S422 bug. Binding must override it.
    const mockGenerate = vi.fn().mockResolvedValue(JSON.stringify({
      slides: [
        { beat: 'hook', title: 'Your Credit Report Is Lying to You' },
        { beat: 'cta', title: 'Start Today', automationKeyword: 'CREDIT AUDIT' },
      ],
    }))
    const beats = await generateCarouselBeats(SAMPLE_INPUT, { generate: mockGenerate })
    const cta = beats.find(b => b.beat === 'cta')!
    expect(cta.automationKeyword).toBe('RIZE')
  })

  it('binds the keyword onto the generic fallback beats too', async () => {
    const mockGenerate = vi.fn().mockResolvedValue('garbage')
    const beats = await generateCarouselBeats(SAMPLE_INPUT, { generate: mockGenerate })
    expect(beats.find(b => b.beat === 'cta')!.automationKeyword).toBe('RIZE')
  })
})

describe('bindAutomationKeyword', () => {
  it('overrides only the cta beat and leaves others untouched', () => {
    const beats = parseBeatResponse(VALID_BEATS_JSON)!
    const bound = bindAutomationKeyword(beats, 'RIZE')
    expect(bound.find(b => b.beat === 'cta')!.automationKeyword).toBe('RIZE')
    expect(bound.find(b => b.beat === 'hook')!.automationKeyword).toBeUndefined()
  })

  it('is a no-op when keyword is null/blank', () => {
    const beats = parseBeatResponse(VALID_BEATS_JSON)!
    expect(bindAutomationKeyword(beats, null)).toEqual(beats)
    expect(bindAutomationKeyword(beats, '   ')).toEqual(beats)
  })
})

describe('prompt construction', () => {
  it('enforces the destroy stance in the system prompt', () => {
    const sys = buildSystemPrompt({ ...SAMPLE_INPUT, stance: 'destroy' })
    expect(sys).toMatch(/DESTROY/)
    expect(sys).toMatch(/AGAINST the status quo/i)
  })

  it('uses the mimic stance when stance is mimic', () => {
    const sys = buildSystemPrompt({ ...SAMPLE_INPUT, stance: 'mimic' })
    expect(sys).toMatch(/MIMIC/)
  })

  it('binds the exact keyword and cta objective in the user prompt', () => {
    const user = buildUserPrompt({ ...SAMPLE_INPUT, automationKeyword: 'RIZE', ctaObjective: 'automation' })
    expect(user).toMatch(/EXACTLY "RIZE"/)
    expect(user).toMatch(/CTA OBJECTIVE: "automation"/)
  })
})
