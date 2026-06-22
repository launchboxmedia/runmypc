// Resolve the cover *visual* (pixels only — never text). Priority:
//   1. a selected approved image asset, if the job has one
//   2. otherwise generate 2 text-free variants and vision-score the winner
// Returns the chosen image as a base64 data-URI for embedding directly in the
// cover HTML (the render lambda has no guaranteed network egress, so external
// <img src> URLs cannot be relied on). Any failure → null (text-only cover).
import { STYLE_LIBRARY, type StyleId } from '@/lib/designSystem/styleLibrary'
import type { ResolvedDesignSystem } from '@/lib/designSystem/resolveDesignSystem'
import { generateImage as atlasGenerateImage } from '@/lib/atlascloud'
import { pickBestVisual as defaultPickBestVisual, sniffMediaType } from './scoreVisual'

export type CoverVisualDeps = {
  generateImage: (p: { prompt: string }) => Promise<{ url: string }>
  pickBestVisual: (images: Buffer[], ctx: { topic: string; styleId: StyleId }) => Promise<number>
}

const defaults: CoverVisualDeps = {
  generateImage: atlasGenerateImage,
  pickBestVisual: defaultPickBestVisual,
}

// Number of cover variants generated then vision-scored. Image generation is the
// dominant dollar cost of a carousel — tune here. Default 2 (generate + pick best).
const COVER_VARIANTS = 2

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch visual failed (${res.status})`)
  return Buffer.from(await res.arrayBuffer())
}

function toDataUri(buf: Buffer): string {
  return `data:${sniffMediaType(buf)};base64,${buf.toString('base64')}`
}

function buildPrompt(style: StyleId, topic: string, audience?: string | null): string {
  const d = STYLE_LIBRARY[style]
  return [
    `A single high-quality background visual for a social media carousel cover about "${topic}".`,
    audience ? `Audience: ${audience}.` : '',
    `Visual style — ${d.display_name}: ${d.hook_technique}`,
    `Composition: ${d.layout_descriptor}`,
    `ABSOLUTELY NO text, no words, no letters, no numbers, no captions, no logos in the image.`,
    `Leave clean negative space for a headline to be added later. Photographic/illustrative subject only, scroll-stopping, 4:5 portrait framing.`,
  ]
    .filter(Boolean)
    .join(' ')
}

export async function resolveCoverVisual(
  input: {
    resolved: ResolvedDesignSystem
    topic: string
    audience?: string | null
    selectedAssetUrl?: string | null
  },
  depsOverride?: Partial<CoverVisualDeps>
): Promise<{ dataUri: string } | null> {
  const deps = { ...defaults, ...depsOverride }
  const { resolved, topic, audience, selectedAssetUrl } = input

  // 1. Selected approved asset wins — no generation, no scoring.
  if (selectedAssetUrl) {
    try {
      const buf = await fetchBuffer(selectedAssetUrl)
      return { dataUri: toDataUri(buf) }
    } catch {
      // fall through to generation
    }
  }

  // 2. Generate 2 text-free variants, score, pick winner.
  try {
    const prompt = buildPrompt(resolved.style_id, topic, audience)
    const results = await Promise.allSettled(
      Array.from({ length: COVER_VARIANTS }, () => deps.generateImage({ prompt }))
    )
    const urls = results
      .filter((r): r is PromiseFulfilledResult<{ url: string }> => r.status === 'fulfilled')
      .map(r => r.value.url)
    if (urls.length === 0) return null

    const buffers = (await Promise.allSettled(urls.map(fetchBuffer)))
      .filter((r): r is PromiseFulfilledResult<Buffer> => r.status === 'fulfilled')
      .map(r => r.value)
    if (buffers.length === 0) return null
    if (buffers.length === 1) return { dataUri: toDataUri(buffers[0]) }

    const best = await deps.pickBestVisual(buffers, { topic, styleId: resolved.style_id })
    return { dataUri: toDataUri(buffers[best] ?? buffers[0]) }
  } catch {
    return null
  }
}
