// AssetProvider — produces EditorialAssets (pixels only) from prompts. The
// renderer never learns HOW pixels were made. v1 primary strategy: NATIVE
// TRANSPARENT GENERATION (OpenAI gpt-image-1, background:'transparent' → a real
// alpha channel). Segmentation is a deferred fallback for opaque uploads.
// Everything fails OPEN: any failure returns null so the caller degrades to a
// type-only / legacy cover rather than blocking the carousel.
import OpenAI from 'openai'
import sharp from 'sharp'
import type { SubjectAsset, EditorialAssets } from './composeCover'

const IMAGE_MODEL = 'gpt-image-1'
const SUBJECT_SIZE = '1024x1536' as const // portrait; subject is object-fit:contain in-frame
const FRAME_WIDTH = 1080
const FRAME_HEIGHT = 1350

export type AssetProviderDeps = {
  generateImage: (p: { prompt: string; transparent: boolean }) => Promise<Buffer | null>
}

let _openai: OpenAI
function openai(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

const defaultDeps: AssetProviderDeps = {
  async generateImage({ prompt, transparent }) {
    const res = await openai().images.generate({
      model: IMAGE_MODEL,
      prompt,
      size: SUBJECT_SIZE,
      quality: 'medium',
      n: 1,
      ...(transparent ? { background: 'transparent' as const } : {}),
    })
    const b64 = res.data?.[0]?.b64_json
    return b64 ? Buffer.from(b64, 'base64') : null
  },
}

// Decode the alpha channel → content bounding box (alpha > threshold) + coverage.
export async function alphaBBox(png: Buffer): Promise<{
  width: number; height: number; bbox: { x: number; y: number; w: number; h: number }; coverage: number
}> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  let minX = width, minY = height, maxX = 0, maxY = 0, opaque = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * channels + 3] > 24) {
        opaque++
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  return {
    width, height,
    bbox: { x: minX, y: minY, w: Math.max(0, maxX - minX), h: Math.max(0, maxY - minY) },
    coverage: opaque / (width * height),
  }
}

// Generate a transparent subject → SubjectAsset with bbox in 1080×1350 frame
// coords. Returns null if no image, no real alpha, or coverage is degenerate
// (empty / whole-frame = no actual cutout).
export async function generateSubject(prompt: string, deps: AssetProviderDeps = defaultDeps): Promise<SubjectAsset | null> {
  try {
    const png = await deps.generateImage({ prompt, transparent: true })
    if (!png) return null
    const meta = await sharp(png).metadata()
    if (!meta.hasAlpha) return null
    const info = await alphaBBox(png)
    if (info.coverage < 0.03 || info.coverage > 0.97) return null

    // Crop to the alpha bbox — most of the raw canvas is transparent padding;
    // shipping it as base64 in the render-lambda payload is pure waste (413s).
    // PNG is lossless-only; for photographic content with alpha that's still
    // 3-4MB post-crop. WebP (lossy color, near-lossless alpha) cuts this ~5-8x
    // and Chromium (the render lambda) decodes it natively.
    const cropped = await sharp(png)
      .extract({ left: info.bbox.x, top: info.bbox.y, width: info.bbox.w, height: info.bbox.h })
      .webp({ quality: 82, alphaQuality: 100 })
      .toBuffer()

    // The crop changes the image's own aspect ratio, so the old
    // scale-by-canvas-height mapping no longer holds. Recompute the frame bbox
    // from how the cropped image actually renders under composeCover.ts's
    // object-fit:contain;object-position:center bottom.
    const scale = Math.min(FRAME_WIDTH / info.bbox.w, FRAME_HEIGHT / info.bbox.h)
    const renderedW = info.bbox.w * scale
    const renderedH = info.bbox.h * scale
    const bbox = {
      x: Math.round((FRAME_WIDTH - renderedW) / 2),
      y: Math.round(FRAME_HEIGHT - renderedH),
      w: Math.round(renderedW),
      h: Math.round(renderedH),
    }
    return { dataUri: `data:image/webp;base64,${cropped.toString('base64')}`, hasAlpha: true, bbox }
  } catch (e) {
    console.warn('[assetProvider] subject generation failed:', e instanceof Error ? e.message : e)
    return null
  }
}

export async function generateBackground(prompt: string, deps: AssetProviderDeps = defaultDeps): Promise<string | null> {
  try {
    const png = await deps.generateImage({ prompt, transparent: false })
    if (!png) return null
    // No alpha needed — JPEG is 5-10x smaller than PNG for photographic content.
    const jpeg = await sharp(png).jpeg({ quality: 82 }).toBuffer()
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`
  } catch (e) {
    console.warn('[assetProvider] background generation failed:', e instanceof Error ? e.message : e)
    return null
  }
}

// Fulfil a cover's asset requests (subject + background in parallel).
export async function provideEditorialAssets(
  req: { subjectPrompt: string; bgPrompt: string },
  deps: AssetProviderDeps = defaultDeps
): Promise<EditorialAssets> {
  const [subject, background] = await Promise.all([
    generateSubject(req.subjectPrompt, deps),
    generateBackground(req.bgPrompt, deps),
  ])
  return { background, subject }
}
