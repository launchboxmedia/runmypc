// Dominant-color extraction from an image buffer. Uses node-vibrant's
// quantization (NO LLM). Returns a hex string; falls back to a neutral ink color
// if no swatch can be derived.

import { Vibrant } from 'node-vibrant/node'

const FALLBACK = '#111827'

export async function extractDominantColor(image: Buffer): Promise<string> {
  try {
    const palette = await Vibrant.from(image).getPalette()
    const swatch =
      palette.Vibrant ||
      palette.Muted ||
      palette.DarkVibrant ||
      palette.LightVibrant ||
      palette.DarkMuted ||
      palette.LightMuted ||
      Object.values(palette).find(Boolean)
    return swatch?.hex ?? FALLBACK
  } catch {
    return FALLBACK
  }
}
