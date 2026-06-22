// Vision scoring for the 2 generated cover *visuals* (text-free backgrounds).
// One Haiku vision call; returns the index of the better-fitting image. Never
// throws — defaults to 0 so a flaky vision call never blocks generation.
import Anthropic from '@anthropic-ai/sdk'
import type { StyleId } from '@/lib/designSystem/styleLibrary'

const VISION_MODEL = 'claude-haiku-4-5-20251001'

let _anthropic: Anthropic
function anthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _anthropic
}

// Sniff a PNG/JPEG/WebP media type from buffer magic bytes; default png.
export function sniffMediaType(buf: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length >= 12 && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return 'image/png'
}

type ImageBlock = {
  type: 'image'
  source: { type: 'base64'; media_type: 'image/png' | 'image/jpeg' | 'image/webp'; data: string }
}
function imageBlock(buf: Buffer): ImageBlock {
  return { type: 'image', source: { type: 'base64', media_type: sniffMediaType(buf), data: buf.toString('base64') } }
}

export async function pickBestVisual(
  images: Buffer[],
  ctx: { topic: string; styleId: StyleId }
): Promise<number> {
  if (images.length <= 1) return 0
  try {
    const res = await anthropic().messages.create({
      model: VISION_MODEL,
      max_tokens: 10,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Image 1:' },
            imageBlock(images[0]),
            { type: 'text', text: 'Image 2:' },
            imageBlock(images[1]),
            {
              type: 'text',
              text: `These are candidate background visuals for a social carousel COVER about "${ctx.topic}" in a "${ctx.styleId}" style. Headline text will be composited on top later, so the image itself should be TEXT-FREE. Pick the one that is the stronger cover background: relevant to the topic, clean composition with room for a headline, a clear subject, and NO embedded words/letters. Reply with ONLY "1" or "2".`,
            },
          ],
        },
      ],
    })
    const text = res.content[0]?.type === 'text' ? res.content[0].text.trim() : '1'
    return text.includes('2') ? 1 : 0
  } catch {
    return 0
  }
}
