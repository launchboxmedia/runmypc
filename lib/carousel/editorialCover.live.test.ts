// LIVE end-to-end: real planCover → real AssetProvider (gpt-image-1) → composeCover
// for a bold_personal cover, rendered through Hyperframes. Writes a still to
// tmp/cover-verify/ for visual inspection. Verifies the PRODUCTION functions
// (not the spike's inline prompts) wire together and yield a clean cutout.
//   RUN_LIVE=1 npx vitest run lib/carousel/editorialCover.live.test.ts
import { describe, it, expect } from 'vitest'
import { config as loadEnv } from 'dotenv'
import { resolve } from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { planCover } from './editorialPlan'
import { provideEditorialAssets } from './assetProvider'
import { composeCover } from './composeCover'
import { injectStaticVisibility } from './slideHtml'
import { renderStaticPng } from './renderClient'
import type { CarouselBeat } from './types'
import type { ResolvedDesignSystem } from '@/lib/designSystem/resolveDesignSystem'

loadEnv({ path: resolve(process.cwd(), '.env.local') })
const LIVE = process.env.RUN_LIVE === '1'

const RESOLVED: ResolvedDesignSystem = {
  style_id: 'bold_personal', source: 'profile_default', primary_color: '#FFFFFF',
  accent: '#FF3B30', background: '#0B0B0F', split_image_cover: false,
}
const COVER: CarouselBeat = { beat: 'hook', isCover: true, index: 0, title: 'Stop Creating Carousels', highlightWord: 'Carousels' }

describe.skipIf(!LIVE)('editorial cover end-to-end (LIVE)', () => {
  it('plans → generates assets → composes → renders a bold_personal cover', async () => {
    const plan = planCover(COVER, RESOLVED, { topic: 'why your carousels flop', audience: 'creators', handle: 'ravendesigns' })
    expect(plan).not.toBeNull()
    const assets = await provideEditorialAssets({ subjectPrompt: plan!.subjectPrompt, bgPrompt: plan!.bgPrompt })
    expect(assets.subject).not.toBeNull()
    const html = composeCover({ resolved: RESOLVED, headline: plan!.headline, assets, overlapBand: plan!.overlapBand, handle: plan!.handle })
    const png = await renderStaticPng(injectStaticVisibility(html))
    const dir = resolve(process.cwd(), 'tmp', 'cover-verify')
    mkdirSync(dir, { recursive: true })
    writeFileSync(resolve(dir, 'hero-e2e.png'), png)
    console.log('WROTE hero-e2e.png', png.length, 'bytes')
    expect(png.length).toBeGreaterThan(5000)
  }, 300_000)
})
