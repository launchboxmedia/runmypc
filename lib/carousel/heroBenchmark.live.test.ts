// Hero cover benchmark — visual validation of the production pipeline:
//   planCover → provideEditorialAssets → resolveOverlapBand → composeCover → render
//
// Two halves:
//   - "routing" (always on, $0): asserts every pilot case yields a bold_personal Hero plan.
//   - "live render" (RUN_LIVE=1, PAID): generates assets (2× gpt-image-1/cover) + renders a
//     static PNG, capturing plan/assets/geometry + the PNG into tmp/hero-benchmark/NNN/.
//
// Run dry:  npx vitest run lib/carousel/heroBenchmark.live.test.ts -t "routing"
// Run live: RUN_LIVE=1 npx vitest run lib/carousel/heroBenchmark.live.test.ts -t "live render"
import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { config as loadEnv } from 'dotenv'
import { planCover } from './editorialPlan'
import { provideEditorialAssets } from './assetProvider'
import { resolveCoverGeometry } from './coverResolver'
import { composeCover } from './composeCover'
import { injectStaticVisibility } from './slideHtml'
import { renderStaticPng } from './renderClient'
import type { ResolvedDesignSystem } from '@/lib/designSystem/resolveDesignSystem'
import type { CarouselBeat } from './types'

loadEnv({ path: resolve(process.cwd(), '.env.local') })
const LIVE = process.env.RUN_LIVE === '1'

const RESOLVED: ResolvedDesignSystem = {
  style_id: 'bold_personal',
  source: 'profile_default',
  primary_color: '#FFFFFF',
  accent: '#FF3B30',
  background: '#0B0B0F',
  split_image_cover: false,
}

type Case = { id: string; title: string; highlight: string; topic: string; audience: string }
const CASES: Case[] = [
  { id: '001', title: 'Stop Creating Carousels',       highlight: 'Carousels', topic: 'why your carousels flop',        audience: 'content creators' },
  { id: '002', title: 'Your Content Is Invisible',     highlight: 'Invisible', topic: 'why your content gets no reach', audience: 'creators' },
  { id: '003', title: 'The AI Content Formula',        highlight: 'Formula',   topic: 'the ai content formula',         audience: 'marketers' },
  { id: '004', title: 'Build Like A Creative Director', highlight: 'Creative', topic: 'designing like a pro',           audience: 'designers' },
  { id: '005', title: 'Design Systems Win',            highlight: 'Win',       topic: 'why design systems win',         audience: 'designers' },
]

const beatOf = (c: Case): CarouselBeat => ({
  beat: 'hook',
  isCover: true,
  index: 0,
  title: c.title,
  highlightWord: c.highlight,
})

describe('hero benchmark — routing (dry, $0)', () => {
  it('every pilot case yields a non-null bold_personal Hero plan', () => {
    for (const c of CASES) {
      const plan = planCover(beatOf(c), RESOLVED, { topic: c.topic, audience: c.audience, handle: 'ravendesigns' })
      expect(plan, `case ${c.id} planned`).not.toBeNull()
      // visibility into what each case will actually generate
      console.log(`[${c.id}] tokens=${plan!.headline.map((t) => t.text).join('|')}`)
      console.log(`[${c.id}] subject="${plan!.subjectPrompt.slice(0, 90)}..."`)
    }
  })
})

describe.skipIf(!LIVE)('hero benchmark — live render (5 covers, PAID)', () => {
  it('renders the pilot batch and captures debug data', async () => {
    const root = resolve(process.cwd(), 'tmp', 'hero-benchmark')
    for (const c of CASES) {
      const dir = resolve(root, c.id)
      mkdirSync(dir, { recursive: true })

      const plan = planCover(beatOf(c), RESOLVED, { topic: c.topic, audience: c.audience, handle: 'ravendesigns' })!
      const assets = await provideEditorialAssets({ subjectPrompt: plan.subjectPrompt, bgPrompt: plan.bgPrompt })
      const geometry = plan.overlapBand
        ? ({ layoutMode: 'overlap', overlapBand: plan.overlapBand } as const)
        : resolveCoverGeometry(assets.subject)
      const html = composeCover({ resolved: RESOLVED, headline: plan.headline, assets, ...geometry, handle: plan.handle })

      writeFileSync(
        resolve(dir, 'plan.json'),
        JSON.stringify({ archetype: plan.archetype, headline: plan.headline, subjectPrompt: plan.subjectPrompt, bgPrompt: plan.bgPrompt }, null, 2),
      )
      writeFileSync(
        resolve(dir, 'assets.json'),
        JSON.stringify(
          {
            backgroundPresent: !!assets.background,
            subject: assets.subject
              ? { hasAlpha: assets.subject.hasAlpha, bbox: assets.subject.bbox, dataUriLen: assets.subject.dataUri.length }
              : null,
          },
          null,
          2,
        ),
      )
      writeFileSync(
        resolve(dir, 'resolved-geometry.json'),
        JSON.stringify(
          {
            layoutMode: geometry.layoutMode,
            reason: geometry.layoutMode === 'stacked' ? geometry.reason : null,
            overlapBand: geometry.layoutMode === 'overlap' ? geometry.overlapBand : null,
            subjectBbox: assets.subject?.bbox ?? null,
            frame: { w: 1080, h: 1350 },
            fallback: { subjectMissing: !assets.subject, blindBand: !plan.overlapBand && !assets.subject },
          },
          null,
          2,
        ),
      )

      if (!assets.subject) {
        writeFileSync(resolve(dir, 'FAILED-no-subject.txt'), plan.subjectPrompt)
        console.log(`[${c.id}] FAIL class-A: no subject cutout (fail-open)`)
        continue
      }

      const png = await renderStaticPng(injectStaticVisibility(html))
      writeFileSync(resolve(dir, 'rendered-output.png'), png)
      console.log(`[${c.id}] OK png=${png.length}B mode=${geometry.layoutMode} bbox=${JSON.stringify(assets.subject.bbox)}`)
      expect(png.length).toBeGreaterThan(5000)
    }
  }, 600_000)
})
