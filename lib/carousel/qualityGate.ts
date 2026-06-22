// Visual quality gate: Haiku vision reads a rendered slide PNG and checks
// legibility + render correctness (text fully visible, fonts rendered not
// fallback-broken, adequate contrast, the slide's copy present). Fail-open: any
// vision error returns pass=true, because the render itself is deterministic and
// a flaky vision call must never block delivery. A real failure triggers an HTML
// regen + re-render upstream (capped at 2 retries).
import Anthropic from '@anthropic-ai/sdk'
import type { SlidePlan } from './types'
import { sniffMediaType } from './scoreVisual'

const VISION_MODEL = 'claude-haiku-4-5-20251001'

let _anthropic: Anthropic
function anthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _anthropic
}

export type QualityResult = { pass: boolean; issues: string }

export type QualityDeps = {
  vision: (png: Buffer, slide: SlidePlan) => Promise<{ pass: boolean; issues: string }>
}

const defaultDeps: QualityDeps = {
  async vision(png, slide) {
    const res = await anthropic().messages.create({
      model: VISION_MODEL,
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: sniffMediaType(png), data: png.toString('base64') },
            },
            {
              type: 'text',
              text: `This is a rendered Instagram carousel slide. Its intended copy is: ${JSON.stringify(slide.text)}.
Check ONLY for rendering defects:
- Is ALL text fully visible (not cut off, clipped, or overflowing the frame)?
- Is the text legible with adequate contrast against the background?
- Do the fonts look intentionally rendered (NOT a broken/blank/missing-glyph fallback)?
- Is the intended copy actually present?
Respond ONLY with compact JSON: {"pass": true|false, "issues": "<short description, empty if pass>"}`,
            },
          ],
        },
      ],
    })
    const text = res.content[0]?.type === 'text' ? res.content[0].text : '{}'
    const m = text.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(m ? m[0] : '{}') as { pass?: boolean; issues?: string }
    return { pass: parsed.pass !== false, issues: parsed.issues || '' }
  },
}

export async function checkSlide(
  png: Buffer,
  slide: SlidePlan,
  deps: QualityDeps = defaultDeps
): Promise<QualityResult> {
  try {
    return await deps.vision(png, slide)
  } catch {
    return { pass: true, issues: '' } // fail-open
  }
}
