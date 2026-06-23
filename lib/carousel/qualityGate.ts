// Visual quality gate: Haiku vision reads a rendered slide PNG and checks
// legibility + render correctness. Fail-open: any vision error returns
// pass=true because a flaky vision call must never block delivery.
import Anthropic from '@anthropic-ai/sdk'
import type { CarouselBeat } from './types'
import { sniffMediaType } from './scoreVisual'

const VISION_MODEL = 'claude-haiku-4-5-20251001'

let _anthropic: Anthropic
function anthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _anthropic
}

export type QualityResult = { pass: boolean; issues: string }

export type QualityDeps = {
  vision: (png: Buffer, beat: CarouselBeat) => Promise<QualityResult>
}

const defaultDeps: QualityDeps = {
  async vision(png, beat) {
    const res = await anthropic().messages.create({
      model: VISION_MODEL,
      max_tokens: 250,
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
              text: `This is a rendered Instagram carousel slide (beat: ${beat.beat}, slide ${beat.index}).
Required title text: "${beat.title}".

Check ONLY for rendering defects:
- Is ALL text fully visible (not cut off, clipped, or overflowing the frame)?
- Are any text elements rotated, compressed into a vertical pill, or squeezed into containers too small for their content? (These make text unreadable — flag them.)
- Is the text legible with adequate contrast against the background?
- Do fonts look intentionally rendered (NOT broken/blank/missing-glyph fallback)?
- Is the required title text actually present and readable?

Respond ONLY with compact JSON: {"pass": true|false, "issues": "<short description, empty string if pass>"}`,
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
  beat: CarouselBeat,
  deps: QualityDeps = defaultDeps
): Promise<QualityResult> {
  try {
    return await deps.vision(png, beat)
  } catch {
    return { pass: true, issues: '' } // fail-open
  }
}
