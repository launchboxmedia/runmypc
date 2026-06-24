// LIVE-FIRE verification of the QA + observation pipeline (NOT a unit test).
// Runs only when RUN_LIVE=1. Exercises the exact lib modules content-generation
// uses: generateCarouselBeats (real model cascade) → buildFallbackSlide →
// renderStaticPng (deployed render service) → runVisionQA (vision model), and
// writes the .debug_logs artifacts (CAROUSEL_DEBUG forced on).
//
//   RUN_LIVE=1 npx vitest run lib/carousel/liveFireQA.test.ts
import { describe, it, expect } from 'vitest'
import { config as loadEnv } from 'dotenv'
import { resolve } from 'path'
import { generateCarouselBeats } from './generateCarouselBeats'
import { checkHookOverflow } from './layoutGuards'
import { buildFallbackSlide, injectStaticVisibility } from './slideHtml'
import { renderStaticPng } from './renderClient'
import { runVisionQA } from './visionQA'
import { logRenderFrame } from './debugLogger'
import type { ResolvedDesignSystem } from '@/lib/designSystem/resolveDesignSystem'

loadEnv({ path: resolve(process.cwd(), '.env.local') })
process.env.CAROUSEL_DEBUG = '1' // force debug interception regardless of NODE_ENV

const LIVE = process.env.RUN_LIVE === '1'

const RESOLVED: ResolvedDesignSystem = {
  style_id: 'premium_editorial',
  source: 'profile_default',
  primary_color: '#f5f0e6',
  accent: '#c0a062',
  background: '#0e0e0e',
  split_image_cover: false,
}

describe.skipIf(!LIVE)('carousel live-fire QA', () => {
  it('generate → render → vision with destroy / RIZE / automation', async () => {
    const beats = await generateCarouselBeats({
      topic: 'speed up a slow Windows PC',
      audience: 'everyday PC owners frustrated with lag',
      outcome: 'a noticeably faster computer in under an hour',
      researchContext: 'Users complain about startup bloat, background apps eating RAM, and full disks.',
      stance: 'destroy',
      ctaObjective: 'automation',
      automationKeyword: 'RIZE',
    })

    const cta = beats.find(b => b.beat === 'cta')
    console.log(`LIVEFIRE beats=${beats.length} ctaKeyword=${cta?.automationKeyword}`)
    expect(cta?.automationKeyword).toBe('RIZE')

    const overflow = checkHookOverflow(beats)
    console.log(`LIVEFIRE overflowWarnings=${overflow.length}`)

    // Render a BODY slide (index 1–6) with dark contrast → exercises scrim + swipe.
    const bodyBeat = beats.find(b => !b.isCover && b.beat !== 'cta') ?? beats[1]
    const idx = Math.min(Math.max(bodyBeat.index, 1), 6)
    const html = buildFallbackSlide({ ...bodyBeat, index: idx, forceContrastMode: 'dark' }, RESOLVED)
    console.log(`LIVEFIRE bodyHtml hasScrim=${html.includes('<div class="contrast-scrim">')} hasSwipe=${html.includes('id="swipe-teaser"')}`)

    const png = await renderStaticPng(injectStaticVisibility(html))
    await logRenderFrame(png)
    console.log(`LIVEFIRE renderPngBytes=${png.length}`)

    const verdict = await runVisionQA(png)
    console.log(`LIVEFIRE visionVerdict=${JSON.stringify(verdict)}`)
    expect(['PASS', 'FAIL']).toContain(verdict.status)
  }, 180000)
})
