// Generates structured carousel beats from job research data. This replaces
// the old buildSlidePlan "slice the IG post" approach. Each beat is a
// standalone scannable slide — NOT derived from social copy.
import Anthropic from '@anthropic-ai/sdk'
import type { CarouselBeat, SlideBeat } from './types'

const BEAT_MODEL = 'claude-haiku-4-5-20251001'
const MAX_SLIDES = 12

export type BeatsInput = {
  topic: string
  audience?: string | null
  outcome?: string | null
  researchContext?: string | null
}

export type BeatsDeps = { generate: (prompt: string) => Promise<string> }

let _anthropic: Anthropic
function anthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _anthropic
}

const defaultDeps: BeatsDeps = {
  async generate(prompt) {
    const res = await anthropic().messages.create({
      model: BEAT_MODEL,
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })
    return res.content[0]?.type === 'text' ? res.content[0].text : ''
  },
}

const VALID_BEATS: SlideBeat[] = ['hook', 'problem', 'value', 'payoff', 'cta']

// Parse and validate the LLM JSON response. Returns null if unusable.
export function parseBeatResponse(raw: string): CarouselBeat[] | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(match ? match[0] : raw) as { slides?: unknown[] }
    if (!Array.isArray(parsed.slides) || parsed.slides.length === 0) return null

    const valid = (parsed.slides as Record<string, unknown>[])
      .filter(s => typeof s === 'object' && s !== null)
      .filter(s => typeof s.title === 'string' && (s.title as string).trim().length > 0)
      .filter(s => VALID_BEATS.includes(s.beat as SlideBeat))

    if (valid.length === 0) return null

    const hasHook = valid.some(s => s.beat === 'hook')
    if (!hasHook) return null

    // Find CTA before slicing so it survives the cap. Reserve one slot for it.
    const cta = valid.find(s => s.beat === 'cta')
    const withoutCta = valid.filter(s => s.beat !== 'cta').slice(0, cta ? MAX_SLIDES - 1 : MAX_SLIDES)
    const ordered = cta ? [...withoutCta, cta] : withoutCta

    return ordered.map((s, i): CarouselBeat => ({
      beat: s.beat as SlideBeat,
      isCover: i === 0 && s.beat === 'hook',
      index: i,
      title: (s.title as string).trim(),
      ...(typeof s.subhead === 'string' && s.subhead.trim() ? { subhead: s.subhead.trim() } : {}),
      ...(typeof s.calloutBox === 'string' && s.calloutBox.trim() ? { calloutBox: s.calloutBox.trim() } : {}),
      ...(Array.isArray(s.bullets) && s.bullets.length > 0 ? { bullets: s.bullets.map(String) } : {}),
      ...(Array.isArray(s.checklist) && s.checklist.length > 0 ? { checklist: s.checklist.map(String) } : {}),
      ...(typeof s.bottomAnchor === 'string' && s.bottomAnchor.trim() ? { bottomAnchor: s.bottomAnchor.trim() } : {}),
      ...(typeof s.body === 'string' && s.body.trim() ? { body: s.body.trim() } : {}),
    }))
  } catch {
    return null
  }
}

function buildFallbackBeats(input: BeatsInput): CarouselBeat[] {
  return [
    { beat: 'hook', isCover: true, index: 0, title: input.topic },
    { beat: 'value', isCover: false, index: 1, title: input.outcome?.split('\n')[0]?.slice(0, 60) || 'Here is what we do' },
    { beat: 'cta', isCover: false, index: 2, title: 'Follow for more', bottomAnchor: 'Start today' },
  ]
}

function buildPrompt(input: BeatsInput): string {
  return [
    `You are a carousel strategist. Plan a structured Instagram carousel — each slide is a standalone scannable beat, NOT a continuous-read script.`,
    ``,
    `Output ONLY compact JSON: {"slides": [...]}. No commentary, no markdown fences.`,
    ``,
    `Beat sequence (fixed order):`,
    `1. hook (exactly 1 slide) — attention-grabbing opener`,
    `2. problem (exactly 1 slide) — the specific pain this audience feels`,
    `3. value (2–7 slides) — distinct non-redundant insight/solution beats`,
    `4. payoff (1–2 slides) — proof, result, transformation`,
    `5. cta (exactly 1 slide) — single clear action step`,
    ``,
    `Total slides MUST NOT exceed ${MAX_SLIDES}. Compress value beats if needed.`,
    ``,
    `Per-slide schema (every field except title is OPTIONAL — include only if it adds genuine value for that beat):`,
    `{`,
    `  "beat": "hook"|"problem"|"value"|"payoff"|"cta",`,
    `  "title": string,        // REQUIRED ≤8 words, strong and scannable`,
    `  "subhead": string,      // ≤2 lines, expands title`,
    `  "calloutBox": string,   // short anchor/pull-quote`,
    `  "bullets": string[],    // short fragments, not full sentences`,
    `  "checklist": string[],  // same as bullets, rendered with checkboxes`,
    `  "bottomAnchor": string, // closing line for slide`,
    `  "body": string          // RARE, max 2 lines, only when nothing else fits`,
    `}`,
    ``,
    `Rules:`,
    `- Each slide stands alone — no cross-references like "as mentioned above"`,
    `- Value beats must be genuinely distinct — no rephrasing the same point`,
    `- Do NOT include both bullets and checklist on the same slide`,
    `- Do NOT force every optional field — use what each beat genuinely needs`,
    ``,
    `Topic: ${input.topic}`,
    input.audience ? `Audience: ${input.audience}` : '',
    input.outcome ? `Outcome: ${input.outcome.slice(0, 400)}` : '',
    input.researchContext ? `Research context:\n${input.researchContext.slice(0, 800)}` : '',
  ].filter(Boolean).join('\n')
}

export async function generateCarouselBeats(
  input: BeatsInput,
  depsOverride?: Partial<BeatsDeps>
): Promise<CarouselBeat[]> {
  const deps = { ...defaultDeps, ...depsOverride }
  try {
    const raw = await deps.generate(buildPrompt(input))
    const beats = parseBeatResponse(raw)
    if (beats) return beats
    console.warn('[generateCarouselBeats] LLM response invalid, using fallback')
  } catch (err) {
    console.warn('[generateCarouselBeats] LLM call failed, using fallback:', err)
  }
  return buildFallbackBeats(input)
}
