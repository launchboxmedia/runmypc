// Magazine cover benchmark — mirrors heroBenchmark.live.test.ts's two-tier
// structure (routing/free, live render/paid) for the Magazine archetype.
//
// Run dry:  npx vitest run lib/carousel/magazineBenchmark.live.test.ts -t "routing"
// Run live: RUN_LIVE=1 npx vitest run lib/carousel/magazineBenchmark.live.test.ts -t "live render"
import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { config as loadEnv } from 'dotenv'
import { planCover } from './editorialPlan'
import { provideEditorialAssets } from './assetProvider'
import { magazineArchetype } from './archetypes/magazine'
import { injectStaticVisibility } from './slideHtml'
import { renderStaticPng } from './renderClient'
import type { ResolvedDesignSystem } from '@/lib/designSystem/resolveDesignSystem'
import type { CarouselBeat } from './types'

loadEnv({ path: resolve(process.cwd(), '.env.local') })
const LIVE = process.env.RUN_LIVE === '1'

const RESOLVED: ResolvedDesignSystem = {
  style_id: 'premium_editorial',
  source: 'profile_default',
  primary_color: '#141414',
  accent: '#7A5C3E',
  background: '#F7F5F1',
  split_image_cover: false,
}

type Case = { id: string; title: string; highlight: string; topic: string; audience: string }
const CASES: Case[] = [
  { id: '001', title: 'The Quiet Power Of Focus', highlight: 'Focus', topic: 'deep work for creatives', audience: 'designers' },
  { id: '002', title: 'Craft Over Chaos',         highlight: 'Craft', topic: 'slow, deliberate creative practice', audience: 'photographers' },
  { id: '003', title: 'Design With Intention',    highlight: 'Intention', topic: 'intentional design systems', audience: 'design leads' },
]

const beatOf = (c: Case): CarouselBeat => ({
  beat: 'hook',
  isCover: true,
  index: 0,
  title: c.title,
  highlightWord: c.highlight,
})

describe('magazine benchmark — routing (dry, $0)', () => {
  it('every pilot case yields a non-null premium_editorial magazine plan', () => {
    for (const c of CASES) {
      const plan = planCover(beatOf(c), RESOLVED, { topic: c.topic, audience: c.audience, handle: 'ravendesigns' })
      expect(plan, `case ${c.id} planned`).not.toBeNull()
      expect(plan!.archetype).toBe('magazine')
      console.log(`[${c.id}] tokens=${plan!.headline.map((t) => t.text).join('|')}`)
    }
  })
})

describe.skipIf(!LIVE)('magazine benchmark — live render (PAID)', () => {
  it('renders the pilot batch and captures debug data', async () => {
    const root = resolve(process.cwd(), 'tmp', 'magazine-benchmark')
    for (const c of CASES) {
      const dir = resolve(root, c.id)
      mkdirSync(dir, { recursive: true })

      const plan = planCover(beatOf(c), RESOLVED, { topic: c.topic, audience: c.audience, handle: 'ravendesigns' })!
      const assets = await provideEditorialAssets({ subjectPrompt: plan.subjectPrompt, bgPrompt: plan.bgPrompt })
      const html = magazineArchetype.layout({ resolved: RESOLVED, headline: plan.headline, assets, handle: plan.handle })

      writeFileSync(resolve(dir, 'plan.json'), JSON.stringify(plan, null, 2))
      const png = await renderStaticPng(injectStaticVisibility(html))
      writeFileSync(resolve(dir, 'rendered-output.png'), png)
      console.log(`[${c.id}] OK png=${png.length}B`)
      expect(png.length).toBeGreaterThan(5000)
    }
  }, 600_000)
})
