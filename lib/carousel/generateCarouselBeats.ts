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
      ...(typeof s.proofImageUri === 'string' && s.proofImageUri.trim() ? { proofImageUri: s.proofImageUri.trim() } : {}),
      ...(typeof s.slideComponent === 'string' && ['cover','narrative','stat_callout','proof','cta'].includes(s.slideComponent) ? { slideComponent: s.slideComponent as CarouselBeat['slideComponent'] } : {}),
      ...(typeof s.highlightWord === 'string' && s.highlightWord.trim() ? { highlightWord: s.highlightWord.trim() } : {}),
      ...(typeof s.automationKeyword === 'string' && s.automationKeyword.trim() ? { automationKeyword: s.automationKeyword.trim() } : {}),
      ...(typeof s.ctaInstagramInstructions === 'string' && s.ctaInstagramInstructions.trim() ? { ctaInstagramInstructions: s.ctaInstagramInstructions.trim() } : {}),
      ...(typeof s.ctaTiktokInstructions === 'string' && s.ctaTiktokInstructions.trim() ? { ctaTiktokInstructions: s.ctaTiktokInstructions.trim() } : {}),
    }))
  } catch {
    return null
  }
}

function buildFallbackBeats(input: BeatsInput): CarouselBeat[] {
  return [
    { beat: 'hook', isCover: true, index: 0, title: input.topic, slideComponent: 'cover' },
    { beat: 'value', isCover: false, index: 1, title: input.outcome?.split('\n')[0]?.slice(0, 60) || 'Here is what we do', slideComponent: 'narrative' },
    { beat: 'cta', isCover: false, index: 2, title: 'Follow for more', bottomAnchor: 'Start today', slideComponent: 'cta' },
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
    `Per-slide schema (every field except beat, slideComponent, and title is OPTIONAL):`,
    `{`,
    `  "beat": "hook"|"problem"|"value"|"payoff"|"cta",`,
    `  "slideComponent": "cover"|"narrative"|"stat_callout"|"proof"|"cta",  // layout selector — REQUIRED`,
    `  "title": string,        // REQUIRED — hook ≤12 words; all others ≤8 words`,
    `  "highlightWord": string, // hook slide only — ONE power word from the title to visually accent`,
    `  "subhead": string,      // ≤2 lines, expands title`,
    `  "calloutBox": string,   // short anchor/pull-quote`,
    `  "bullets": string[],    // short fragments, not full sentences`,
    `  "checklist": string[],  // same as bullets, rendered with checkboxes`,
    `  "bottomAnchor": string, // closing line for slide`,
    `  "body": string,         // RARE, max 2 lines, only when nothing else fits`,
    `  "proofImageUri": string // ONLY on payoff/value beats — set to "mock_asset_required" when the beat warrants a testimonial/result image`,
    `}`,
    ``,
    `HOOK FRAMEWORK — Slide 0 (enforced):`,
    `- Title MUST use exactly one of these 6 frameworks: Question / Shock-Stat / Promise / Step-by-Step / Mistake / Curiosity`,
    `- Title MUST be ≤12 words`,
    `- Select ONE power word from the hook title and output it in "highlightWord"`,
    `- slideComponent MUST be "cover"`,
    ``,
    `COMPONENT SELECTION (enforced):`,
    `- "cover": hook slide only (Slide 0 always)`,
    `- "proof": assign to Slide 2 or 3 to deliver payoff early; MUST pair with proofImageUri: "mock_asset_required"`,
    `- "stat_callout": ONLY when the slide's entire point is a single massive number or data point`,
    `- "narrative": default for value and problem beats`,
    `- "cta": FINAL slide ALWAYS — Direct Response Call to Action, slideComponent MUST be "cta"`,
    ``,
    `CTA AUTOMATION FIELDS (cta beat — all three REQUIRED):`,
    `- "automationKeyword": 1–3 uppercase words the user types to trigger the Manychat flow (e.g. "CREDIT FIX")`,
    `- "ctaInstagramInstructions": tell users to comment the keyword below; they receive instant DM access`,
    `- "ctaTiktokInstructions": tell users to DM the keyword; they receive instant access via DM`,
    ``,
    `TONE — adapt to audience (enforce invisibly in copy, not in schema):`,
    `- B2B / Finance / Professional audience → polished, authoritative, measured`,
    `- D2C / Personal / Consumer / fitness / transformation audience → raw, punchy, conversational`,
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
