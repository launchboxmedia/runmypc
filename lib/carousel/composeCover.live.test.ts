// LIVE render verification for the Hero archetype (NOT a unit test). Renders the
// layered cover through the real Hyperframes service so we can EYEBALL whether
// the lambda composites an α-cutout subject BETWEEN two type layers (type behind
// the figure, a clipped slice in front). This is the make-or-break the unit
// tests cannot prove. Writes PNG + MP4 to tmp/cover-verify/ for inspection.
//
//   RUN_LIVE=1 npx vitest run lib/carousel/composeCover.live.test.ts
import { describe, it, expect } from 'vitest'
import { config as loadEnv } from 'dotenv'
import { resolve } from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { composeCover, type ComposeCoverInput } from './composeCover'
import { injectStaticVisibility } from './slideHtml'
import { renderStaticPng, renderAnimatedSlide } from './renderClient'
import type { ResolvedDesignSystem } from '@/lib/designSystem/resolveDesignSystem'

loadEnv({ path: resolve(process.cwd(), '.env.local') })

const LIVE = process.env.RUN_LIVE === '1'

const toUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`

// Dark vertical gradient background (non-empty cover-bg layer; ken-burns visible).
const BG = toUri(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" width="1080" height="1350">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1b1d27"/><stop offset="1" stop-color="#000000"/>
    </linearGradient></defs>
    <rect width="1080" height="1350" fill="url(#g)"/>
  </svg>`
)

// α-cutout figure: ONLY the figure is opaque; everything else transparent so the
// background + the TYPE_BACK headline show through around it. Slate grey so it
// reads against the near-black bg AND against the type it occludes. Head ~y255.
const FIGURE = toUri(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" width="1080" height="1350">
    <g fill="#737d8c">
      <ellipse cx="540" cy="430" rx="150" ry="178"/>
      <path d="M330 620 Q540 530 750 620 L880 1350 L200 1350 Z"/>
      <ellipse cx="775" cy="470" rx="66" ry="92"/>
      <rect x="735" y="470" width="80" height="200" rx="40"/>
    </g>
  </svg>`
)

const RESOLVED: ResolvedDesignSystem = {
  style_id: 'bold_personal',
  source: 'profile_default',
  primary_color: '#FFFFFF',
  accent: '#FF3B30',
  background: '#0B0B0F',
  split_image_cover: false,
}

const INPUT: ComposeCoverInput = {
  resolved: RESOLVED,
  headline: [
    { text: 'STOP', scale: 'xl', break: true },
    { text: 'CREATING', scale: 'xl', break: true },
    { text: 'CAROUSELS', scale: 'xl', color: 'accent' },
  ],
  assets: {
    background: BG,
    subject: { dataUri: FIGURE, hasAlpha: true, bbox: { x: 200, y: 255, w: 680, h: 1095 } },
  },
  // Narrow slice across the bottom of the accent line: upper part behind the
  // figure's head, lower part painting in front → both effects visible at once.
  overlapBand: { topPct: 30, bottomPct: 40 },
  handle: 'ravendesigns',
}

describe.skipIf(!LIVE)('composeCover Hero (LIVE render)', () => {
  it('composites layered alpha through Hyperframes → PNG + MP4', async () => {
    const html = composeCover(INPUT)
    const dir = resolve(process.cwd(), 'tmp', 'cover-verify')
    mkdirSync(dir, { recursive: true })
    writeFileSync(resolve(dir, 'hero.html'), html)

    // GSAP slides start opacity:0 and reveal over the timeline; a t=0 static
    // capture is blank. injectStaticVisibility forces final-state opacity so the
    // still shows the real composition (same override prod uses for QA stills).
    const png = await renderStaticPng(injectStaticVisibility(html))
    writeFileSync(resolve(dir, 'hero.png'), png)
    console.log('WROTE hero.png', png.length, 'bytes')
    expect(png.length).toBeGreaterThan(5000) // a real composited frame, not an error stub

    const mp4 = await renderAnimatedSlide(html)
    writeFileSync(resolve(dir, 'hero.mp4'), mp4)
    console.log('WROTE hero.mp4', mp4.length, 'bytes')
    expect(mp4.length).toBeGreaterThan(10000)
  }, 240_000)
})
