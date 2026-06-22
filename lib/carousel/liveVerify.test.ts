// LIVE end-to-end verification (NOT a normal unit test). Only runs when
// RUN_LIVE=1 and real API keys are present. Calls Atlas image gen + Anthropic
// vision + the deployed static render service, writes real slide PNGs to
// tmp/carousel-verify/ for visual inspection.
//
//   RUN_LIVE=1 npx vitest run lib/carousel/liveVerify.test.ts
import { describe, it, expect } from 'vitest'
import { config as loadEnv } from 'dotenv'
import { resolve } from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { generateCarousel } from './generateCarousel'
import type { StyleId } from '@/lib/designSystem/styleLibrary'

loadEnv({ path: resolve(process.cwd(), '.env.local') })

const LIVE = process.env.RUN_LIVE === '1'

describe.skipIf(!LIVE)('generateCarousel (LIVE)', () => {
  const igPost = {
    hook: 'Your PC is slower than it should be',
    body: 'Background apps eat your RAM\nStartup programs pile up over time\nA quick cleanup brings real speed back',
    cta: 'Run a free scan with RunMyPC',
  }

  // primaryColor:null forces the implied_tone fallback (e.g. premium_editorial's
  // bronze) so we can verify that flagged palette against real composited photo.
  // Inline SVG brand logo (data-URI) to spot-check deterministic logo placement.
  const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" rx="16" fill="#111827"/><text x="100" y="62" font-family="Arial" font-size="40" font-weight="bold" fill="#fff" text-anchor="middle">LB</text></svg>`
  const LOGO_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(LOGO_SVG).toString('base64')}`

  const cases: { styleId: StyleId; primaryColor: string | null; split?: boolean; assetUrl?: string | null; logo?: boolean }[] = [
    { styleId: 'bold_personal', primaryColor: '#2563EB' },
    { styleId: 'clean_direct', primaryColor: '#2563EB' }, // has the comparison slide
    { styleId: 'premium_editorial', primaryColor: null }, // bronze implied_tone fallback
    { styleId: 'clean_direct', primaryColor: '#2563EB', logo: true }, // logo brand-mark placement
    // To spot-check bronze over real composited photography, set split:true and
    // assetUrl to a real image (the split layout keeps the headline on the solid
    // half). Left out of the default set to avoid a network dependency.
  ]

  it.each(cases)('renders an on-brand carousel for style $styleId (split=$split logo=$logo)', async ({ styleId, primaryColor, split, assetUrl, logo }) => {
    const result = await generateCarousel({
      job: {
        id: 'verify-job',
        topic: 'speed up a slow Windows PC',
        target_audience: 'everyday PC owners',
        outcome: 'a faster computer',
        style_id: styleId, // force the style (no Haiku classify needed)
        primary_color: primaryColor,
        split_image_cover: split ?? false,
      },
      profile: { instagram_handle: 'runmypc' },
      igPost,
      selectedAssetUrl: assetUrl ?? null,
      logoDataUri: logo ? LOGO_DATA_URI : null,
    })

    expect(result.slides.length).toBeGreaterThanOrEqual(3)
    expect(result.slides[0].beat).toBe('hook')
    expect(result.slides[result.slides.length - 1].beat).toBe('cta')

    const dir = resolve(process.cwd(), 'tmp', 'carousel-verify', `${styleId}${logo ? '-logo' : ''}`)
    mkdirSync(dir, { recursive: true })
    for (const s of result.slides) {
      const p = resolve(dir, `slide-${s.index + 1}-${s.beat}.png`)
      writeFileSync(p, s.png)
      console.log('WROTE', p, `${s.png.length} bytes`)
    }
  }, 600_000)
})
