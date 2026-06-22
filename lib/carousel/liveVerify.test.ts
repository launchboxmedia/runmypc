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

  const styles: StyleId[] = ['bold_personal', 'clean_direct']

  it.each(styles)('renders an on-brand carousel for style %s', async (styleId) => {
    const result = await generateCarousel({
      job: {
        id: 'verify-job',
        topic: 'speed up a slow Windows PC',
        target_audience: 'everyday PC owners',
        outcome: 'a faster computer',
        style_id: styleId, // force the style (no Haiku classify needed)
        primary_color: '#2563EB',
        split_image_cover: false,
      },
      profile: { instagram_handle: 'runmypc' },
      igPost,
      selectedAssetUrl: null, // exercise the generate-2-variants + vision-score path
    })

    expect(result.slides.length).toBeGreaterThanOrEqual(3)
    expect(result.slides[0].beat).toBe('hook')
    expect(result.slides[result.slides.length - 1].beat).toBe('cta')

    const dir = resolve(process.cwd(), 'tmp', 'carousel-verify', styleId)
    mkdirSync(dir, { recursive: true })
    for (const s of result.slides) {
      const p = resolve(dir, `slide-${s.index + 1}-${s.beat}.png`)
      writeFileSync(p, s.png)
      console.log('WROTE', p, `${s.png.length} bytes`)
    }
  }, 600_000)
})
