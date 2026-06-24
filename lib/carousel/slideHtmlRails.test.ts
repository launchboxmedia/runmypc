import { describe, it, expect } from 'vitest'
import { buildFallbackSlide } from './slideHtml'
import type { CarouselBeat } from './types'
import type { ResolvedDesignSystem } from '@/lib/designSystem/resolveDesignSystem'

const RESOLVED: ResolvedDesignSystem = {
  style_id: 'premium_editorial',
  source: 'profile_default',
  primary_color: '#111111',
  accent: '#c0a062',
  background: '#0e0e0e',
  split_image_cover: false,
}

const body = (over: Partial<CarouselBeat> = {}): CarouselBeat => ({
  beat: 'value', isCover: false, index: 2, title: 'Step Two', ...over,
})

describe('buildFallbackSlide layout rails', () => {
  it('renders a swipe teaser on body slides 1–6', () => {
    const html = buildFallbackSlide(body({ index: 2 }), RESOLVED)
    expect(html).toContain('id="swipe-teaser"')
    expect(html).toContain('swipe-chevron')
    // GSAP-driven (Hyperframes contract) — not CSS animation
    expect(html).toMatch(/tl\.fromTo\("#swipe-teaser"/)
  })

  it('omits the swipe teaser past slide 6', () => {
    expect(buildFallbackSlide(body({ index: 7 }), RESOLVED)).not.toContain('id="swipe-teaser"')
  })

  it('omits the swipe teaser on the CTA beat', () => {
    expect(buildFallbackSlide(body({ beat: 'cta', index: 3 }), RESOLVED)).not.toContain('id="swipe-teaser"')
  })

  it('respects an explicit showSwipeIndicator override', () => {
    expect(buildFallbackSlide(body({ index: 2, showSwipeIndicator: false }), RESOLVED)).not.toContain('id="swipe-teaser"')
  })

  it('injects a dark scrim and forces white text when forceContrastMode is dark', () => {
    const html = buildFallbackSlide(body({ forceContrastMode: 'dark' }), RESOLVED)
    expect(html).toContain('<div class="contrast-scrim">')
    expect(html).toMatch(/\.slide-title\{[^}]*color:#ffffff/)
  })

  it('does not inject the scrim element when contrast is not dark', () => {
    expect(buildFallbackSlide(body({ forceContrastMode: 'light' }), RESOLVED)).not.toContain('<div class="contrast-scrim">')
  })

  it('renders a page counter showing slide number (index + 1)', () => {
    const html = buildFallbackSlide(body({ index: 4 }), RESOLVED)
    expect(html).toMatch(/page-indicator">5</)
  })
})
