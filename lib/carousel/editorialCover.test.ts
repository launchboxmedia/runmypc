import { describe, it, expect } from 'vitest'
import { compileCarousel } from './phaseOrchestrator'
import type { CarouselBeat } from './types'
import type { ResolvedDesignSystem } from '@/lib/designSystem/resolveDesignSystem'
import type { EditorialAssets } from './composeCover'

const RESOLVED: ResolvedDesignSystem = {
  style_id: 'bold_personal', source: 'profile_default', primary_color: '#FFFFFF',
  accent: '#FF3B30', background: '#0B0B0F', split_image_cover: false,
}
const beats: CarouselBeat[] = [
  { beat: 'hook', isCover: true, index: 0, title: 'Stop Creating Carousels', highlightWord: 'Carousels' },
  { beat: 'value', isCover: false, index: 1, title: 'Do This Instead', bullets: ['one', 'two'] },
  { beat: 'cta', isCover: false, index: 2, title: 'Get The Kit', automationKeyword: 'KIT' },
]

const fakeSubjectUri = 'data:image/png;base64,FAKE'
const assetsWithSubject: EditorialAssets = {
  background: 'data:image/png;base64,BG',
  subject: { dataUri: fakeSubjectUri, hasAlpha: true, bbox: { x: 100, y: 120, w: 700, h: 1200 } },
}
const assetsNoSubject: EditorialAssets = { background: 'data:image/png;base64,BG', subject: null }

// Stub the slow bits: visual batch (body texture + legacy cover) + legacy fetch.
const baseDeps = {
  runVisualBatch: async () => ({ coverUrl: 'http://x/cover.png', bodyTextureUrl: 'http://x/tex.png' }),
  fetchAsDataUri: async () => 'data:image/png;base64,LEGACY',
}

describe('compileCarousel editorial cover branch', () => {
  it('uses the layered editorial cover when a Hero plan + real subject are available', async () => {
    const res = await compileCarousel(
      { beats, resolved: RESOLVED, topic: 'carousels', audience: 'creators', handle: 'ravendesigns' },
      { ...baseDeps, provideEditorialAssets: async () => assetsWithSubject }
    )
    expect(res.slideHtml[0]).toContain('id="layer-subject"')
    expect(res.slideHtml[0]).toContain('id="type-back"')
    expect(res.slideHtml[0]).toContain(fakeSubjectUri)
    expect(res.slideHtml[0]).not.toContain('__COVER_VISUAL__')
  })

  it('falls back to the legacy buildFallbackSlide cover when no real subject comes back', async () => {
    const res = await compileCarousel(
      { beats, resolved: RESOLVED, topic: 'carousels', audience: 'creators', handle: 'ravendesigns' },
      { ...baseDeps, provideEditorialAssets: async () => assetsNoSubject }
    )
    expect(res.slideHtml[0]).not.toContain('id="layer-subject"')
    expect(res.slideHtml[0]).toContain('id="slide"')
    expect(res.slideHtml[0]).toContain('data:image/png;base64,LEGACY')
  })

  it('falls back to legacy (fail-open) when provideEditorialAssets throws', async () => {
    const res = await compileCarousel(
      { beats, resolved: RESOLVED, topic: 'carousels', audience: 'creators', handle: 'ravendesigns' },
      { ...baseDeps, provideEditorialAssets: async () => { throw new Error('network') } }
    )
    expect(res.slideHtml[0]).not.toContain('id="layer-subject"')
    expect(res.slideHtml[0]).toContain('id="slide"')
    expect(res.slideHtml[0]).toContain('data:image/png;base64,LEGACY')
  })

  it('falls back to legacy for styles without a Hero archetype', async () => {
    const res = await compileCarousel(
      { beats, resolved: { ...RESOLVED, style_id: 'premium_editorial' }, topic: 'carousels', audience: 'creators', handle: 'ravendesigns' },
      { ...baseDeps, provideEditorialAssets: async () => assetsWithSubject }
    )
    expect(res.slideHtml[0]).not.toContain('id="layer-subject"')
  })
})
