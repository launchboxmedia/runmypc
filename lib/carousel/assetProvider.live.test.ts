// LIVE asset-provider spike (NOT a unit test). De-risks the OTHER make-or-break:
// can we get a clean α-cutout subject from a REAL image model and composite it?
//
// Strategy under test: NATIVE TRANSPARENT GENERATION — OpenAI gpt-image-1 with
// background:'transparent' returns a PNG with a real alpha channel (no separate
// segmentation service). sharp confirms the alpha and extracts the content bbox
// (the metadata the AssetProvider must supply). Then composeCover renders the
// real subject behind/in-front of the headline through Hyperframes.
//
//   RUN_LIVE=1 npx vitest run lib/carousel/assetProvider.live.test.ts
import { describe, it, expect } from 'vitest'
import { config as loadEnv } from 'dotenv'
import { resolve } from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import OpenAI from 'openai'
import sharp from 'sharp'
import { composeCover, type ComposeCoverInput } from './composeCover'
import { injectStaticVisibility } from './slideHtml'
import { renderStaticPng } from './renderClient'
import type { ResolvedDesignSystem } from '@/lib/designSystem/resolveDesignSystem'

loadEnv({ path: resolve(process.cwd(), '.env.local') })
const LIVE = process.env.RUN_LIVE === '1'

const SUBJECT_PROMPT =
  'Full-body studio photograph of a dramatic figure in a dark hooded jacket, one hand raised toward camera in a firm "stop" gesture, intense direct eye contact, cinematic rim lighting, isolated subject only, completely transparent background, no text, no logos, sharp clean cut-out edges, centered, head to knees visible.'
const BG_PROMPT =
  'Moody dark editorial studio backdrop, deep charcoal with a subtle warm rim glow, abstract and atmospheric, text-free, no people, no objects, cinematic soft vignette, portrait orientation.'

// Decode the alpha channel and find the content bounding box (alpha > threshold).
async function alphaBBox(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  let minX = width, minY = height, maxX = 0, maxY = 0, opaque = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * channels + 3] > 24) {
        opaque++
        if (x < minX) minX = x; if (x > maxX) maxX = x
        if (y < minY) minY = y; if (y > maxY) maxY = y
      }
    }
  }
  const coverage = opaque / (width * height)
  return { width, height, bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY }, coverage }
}

const RESOLVED: ResolvedDesignSystem = {
  style_id: 'bold_personal', source: 'profile_default',
  primary_color: '#FFFFFF', accent: '#FF3B30', background: '#0B0B0F', split_image_cover: false,
}

describe.skipIf(!LIVE)('AssetProvider — native transparent subject (LIVE)', () => {
  it('generates a real α-cutout + bg and composites an editorial cover', async () => {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const dir = resolve(process.cwd(), 'tmp', 'cover-verify')
    mkdirSync(dir, { recursive: true })

    const [subjectRes, bgRes] = await Promise.all([
      openai.images.generate({ model: 'gpt-image-1', prompt: SUBJECT_PROMPT, size: '1024x1536', background: 'transparent', quality: 'medium', n: 1 }),
      openai.images.generate({ model: 'gpt-image-1', prompt: BG_PROMPT, size: '1024x1536', quality: 'medium', n: 1 }),
    ])

    const subjectPng = Buffer.from(subjectRes.data![0].b64_json!, 'base64')
    const bgPng = Buffer.from(bgRes.data![0].b64_json!, 'base64')
    writeFileSync(resolve(dir, 'real-subject.png'), subjectPng)
    writeFileSync(resolve(dir, 'real-bg.png'), bgPng)

    // The make-or-break for THIS spike: did the model return a real alpha channel?
    const meta = await sharp(subjectPng).metadata()
    const info = await alphaBBox(subjectPng)
    console.log('SUBJECT hasAlpha:', meta.hasAlpha, 'coverage:', info.coverage.toFixed(3), 'bbox:', JSON.stringify(info.bbox), `(${info.width}x${info.height})`)
    expect(meta.hasAlpha).toBe(true)
    // A real cutout: not empty, not the whole frame (that = no transparency).
    expect(info.coverage).toBeGreaterThan(0.05)
    expect(info.coverage).toBeLessThan(0.95)

    // bbox → 1080×1350 frame coords (subject is object-fit:contain, so scale by height).
    const scale = 1350 / info.height
    const frameBBox = { x: Math.round(info.bbox.x * scale), y: Math.round(info.bbox.y * scale), w: Math.round(info.bbox.w * scale), h: Math.round(info.bbox.h * scale) }

    const input: ComposeCoverInput = {
      resolved: RESOLVED,
      headline: [
        { text: 'STOP', scale: 'xl', break: true },
        { text: 'CREATING', scale: 'xl', break: true },
        { text: 'CAROUSELS', scale: 'xl', color: 'accent' },
      ],
      assets: {
        background: `data:image/png;base64,${bgPng.toString('base64')}`,
        subject: { dataUri: `data:image/png;base64,${subjectPng.toString('base64')}`, hasAlpha: true, bbox: frameBBox },
      },
      handle: 'ravendesigns',
      // leave overlapBand to default (derived from bbox lower slice)
    }

    const html = composeCover(input)
    const png = await renderStaticPng(injectStaticVisibility(html))
    writeFileSync(resolve(dir, 'hero-real.png'), png)
    console.log('WROTE hero-real.png', png.length, 'bytes; frameBBox:', JSON.stringify(frameBBox))
    expect(png.length).toBeGreaterThan(5000)
  }, 300_000)
})
