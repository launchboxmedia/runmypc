import { describe, it, expect } from 'vitest'
import { composeCover, type ComposeCoverInput, type TypographyToken } from './composeCover'
import { isValidSlideComposition, SLIDE_DURATION } from './slideHtml'
import type { ResolvedDesignSystem } from '@/lib/designSystem/resolveDesignSystem'

const RESOLVED: ResolvedDesignSystem = {
  style_id: 'bold_personal',
  source: 'profile_default',
  primary_color: '#FFFFFF',
  accent: '#FF3B30',
  background: '#0B0B0F',
  split_image_cover: false,
}

// 1×1 transparent PNG — stands in for a real α-cutout subject in unit tests.
const SUBJECT_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const BG_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const HEADLINE: TypographyToken[] = [
  { text: 'STOP', scale: 'xl', break: true },
  { text: 'CREATING', scale: 'xl', break: true },
  { text: 'CAROUSELS', scale: 'xl', color: 'accent' },
]

const base = (over: Partial<ComposeCoverInput> = {}): ComposeCoverInput => ({
  resolved: RESOLVED,
  headline: HEADLINE,
  assets: { background: BG_URI, subject: { dataUri: SUBJECT_URI, hasAlpha: true, bbox: { x: 120, y: 540, w: 840, h: 810 } } },
  overlapBand: { topPct: 55, bottomPct: 100 },
  handle: 'ravendesigns',
  ...over,
})

// z-index of the layer div carrying `marker` (id or class substring).
function zOf(html: string, marker: string): number {
  const re = new RegExp(`<div[^>]*${marker}[^>]*style="[^"]*z-index:(\\d+)`, 'i')
  const m = html.match(re)
  return m ? Number(m[1]) : -1
}

describe('composeCover — Hero archetype (layered editorial cover)', () => {
  it('emits a valid Hyperframes GSAP composition', () => {
    const html = composeCover(base())
    expect(isValidSlideComposition(html)).toBe(true)
    // reaches full duration via the trailing sentinel
    expect(html).toContain(`tl.to("#slide",{opacity:1,duration:0.01},${SLIDE_DURATION})`)
  })

  it('stacks semantic layers background < type-back < subject < type-front', () => {
    const html = composeCover(base())
    const bg = zOf(html, 'id="layer-bg"')
    const back = zOf(html, 'id="type-back"')
    const subj = zOf(html, 'id="layer-subject"')
    const front = zOf(html, 'id="type-front"')
    expect(bg).toBeGreaterThanOrEqual(0)
    expect(bg).toBeLessThan(back)
    expect(back).toBeLessThan(subj)   // subject sits OVER the back headline
    expect(subj).toBeLessThan(front)  // a slice of headline sits OVER the subject
  })

  it('places the α-cutout subject data-URI in the subject layer', () => {
    const html = composeCover(base())
    expect(html).toContain(`src="${SUBJECT_URI}"`)
    expect(html).toMatch(/id="layer-subject"[\s\S]*?src="data:image\/png/i)
  })

  it('clips the front type layer to the overlap band (type reads in front only there)', () => {
    const html = composeCover(base({ overlapBand: { topPct: 55, bottomPct: 100 } }))
    // visible window = 55%..100% → inset(55% 0 0 0)
    expect(html).toMatch(/#type-front[^}]*clip-path:\s*inset\(55%\s+0[%\s]/i)
  })

  it('renders the full headline in BOTH the back and front type layers (identical copies align)', () => {
    const html = composeCover(base())
    expect((html.match(/CAROUSELS/g) || []).length).toBeGreaterThanOrEqual(2)
  })

  it('applies token choreography: accent color on the accent token', () => {
    const html = composeCover(base())
    expect(html).toMatch(/class="tok[^"]*tok-accent"[^>]*>CAROUSELS</)
    expect(html).toContain('#FF3B30') // accent paint present
  })

  it('degrades to a single type layer when no subject is provided (fail-open overlay)', () => {
    const html = composeCover(base({ assets: { background: BG_URI, subject: null } }))
    expect(isValidSlideComposition(html)).toBe(true)
    expect(html).not.toContain('id="layer-subject"')
    expect(html).not.toContain('id="type-front"') // nothing to occlude → no front copy
    expect(html).toContain('id="type-back"')      // headline still renders
  })

  it('renders a solid background when no background asset is provided', () => {
    const html = composeCover(base({ assets: { background: null, subject: null } }))
    expect(html).not.toMatch(/id="cover-bg"/)
    expect(html).toContain(RESOLVED.background)
  })
})
