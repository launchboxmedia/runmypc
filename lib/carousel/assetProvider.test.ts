import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { generateSubject, generateBackground, alphaBBox, type AssetProviderDeps } from './assetProvider'

// Build an RGBA PNG: fully transparent canvas with one opaque red rectangle.
async function cutoutPng(W: number, H: number, rx: number, ry: number, rw: number, rh: number): Promise<Buffer> {
  const rect = await sharp({ create: { width: rw, height: rh, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer()
  return sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: rect, left: rx, top: ry }])
    .png().toBuffer()
}

const depsReturning = (png: Buffer | null): AssetProviderDeps => ({ generateImage: async () => png })

describe('assetProvider.alphaBBox', () => {
  it('finds the opaque content bounding box', async () => {
    const png = await cutoutPng(200, 400, 40, 80, 100, 240)
    const info = await alphaBBox(png)
    expect(info.width).toBe(200)
    expect(info.height).toBe(400)
    expect(info.bbox.x).toBeGreaterThanOrEqual(38)
    expect(info.bbox.x).toBeLessThanOrEqual(42)
    expect(info.bbox.w).toBeGreaterThanOrEqual(96)
    expect(info.coverage).toBeGreaterThan(0.2)
    expect(info.coverage).toBeLessThan(0.4)
  })
})

describe('assetProvider.generateSubject', () => {
  it('returns a SubjectAsset with frame-scaled bbox for a real cutout', async () => {
    const png = await cutoutPng(1024, 1536, 200, 100, 600, 1300)
    const subject = await generateSubject('prompt', depsReturning(png))
    expect(subject).not.toBeNull()
    expect(subject!.hasAlpha).toBe(true)
    expect(subject!.dataUri.startsWith('data:image/png;base64,')).toBe(true)
    expect(subject!.bbox.h).toBeGreaterThan(900)
    expect(subject!.bbox.h).toBeLessThan(1350)
  })

  it('returns null when the model output has no real transparency (coverage ~1)', async () => {
    const opaque = await sharp({ create: { width: 1024, height: 1536, channels: 4, background: { r: 10, g: 10, b: 10, alpha: 1 } } }).png().toBuffer()
    expect(await generateSubject('prompt', depsReturning(opaque))).toBeNull()
  })

  it('returns null when generation yields no image', async () => {
    expect(await generateSubject('prompt', depsReturning(null))).toBeNull()
  })

  it('returns null (fail-open) when generation throws', async () => {
    const deps: AssetProviderDeps = { generateImage: async () => { throw new Error('429 rate limit') } }
    expect(await generateSubject('prompt', deps)).toBeNull()
  })
})

describe('assetProvider.generateBackground', () => {
  it('returns a data-URI on success', async () => {
    const png = await sharp({ create: { width: 1024, height: 1536, channels: 3, background: { r: 20, g: 20, b: 28 } } }).png().toBuffer()
    const bg = await generateBackground('prompt', depsReturning(png))
    expect(bg!.startsWith('data:image/png;base64,')).toBe(true)
  })

  it('returns null (fail-open) on throw', async () => {
    const deps: AssetProviderDeps = { generateImage: async () => { throw new Error('boom') } }
    expect(await generateBackground('prompt', deps)).toBeNull()
  })
})
