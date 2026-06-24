// Generates structured carousel beats from job research data. Each beat is a
// standalone scannable slide — NOT derived from social copy.
//
// Model cascade (strict progressive degradation). Each tier is tried in order;
// the first one to return valid, schema-checked beats wins. A bad/unavailable
// model id or a rate limit simply advances to the next tier, so production never
// silently degrades to the generic stub. buildFallbackBeats is the true last
// resort only when every model fails.
//
//   1. gpt-5.4-mini  — low-latency primary
//   2. gpt-5.5 → gpt-5.4 — frontier escalation on failure
//   3. gpt-4o → claude-3-5-sonnet — legacy tier
//   4. claude-haiku — final safety net (avoids empty stub)
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import type { CarouselBeat, CarouselStance, SlideBeat } from './types'
import { validateCarouselBeats } from './carouselSchema'
import { logGenerationPayload } from './debugLogger'

const MAX_SLIDES = 12

export type BeatsInput = {
  topic: string
  audience?: string | null
  outcome?: string | null
  researchContext?: string | null
  // Database-backed direction — REQUIRED so the controller can never silently
  // drop them again (the S422 regression). Nullable when a job didn't set them.
  stance: CarouselStance | null
  ctaObjective: string | null
  automationKeyword: string | null
}

export type BeatsPrompt = { system: string; user: string }
export type BeatsDeps = { generate: (prompt: BeatsPrompt) => Promise<string> }

// ── Lazy clients ────────────────────────────────────────────────────────────
let _openai: OpenAI
function openai(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}
let _anthropic: Anthropic
function anthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _anthropic
}

// ── Per-model deps factories ────────────────────────────────────────────────
function makeOpenAIDeps(model: string): BeatsDeps {
  return {
    async generate({ system, user }) {
      const res = await openai().chat.completions.create({
        // Cast bypasses the SDK's static model union for current-gen ids.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        model: model as any,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      })
      return res.choices[0]?.message.content ?? ''
    },
  }
}

function makeAnthropicDeps(model: string): BeatsDeps {
  return {
    async generate({ system, user }) {
      const res = await anthropic().messages.create({
        model,
        max_tokens: 2000,
        system,
        messages: [{ role: 'user', content: user }],
      })
      return res.content[0]?.type === 'text' ? res.content[0].text : ''
    },
  }
}

// Strict progressive-degradation cascade. Order is load-bearing.
const STRATEGY_CASCADE: { label: string; deps: BeatsDeps }[] = [
  { label: 'gpt-5.4-mini',           deps: makeOpenAIDeps('gpt-5.4-mini') },
  { label: 'gpt-5.5',                deps: makeOpenAIDeps('gpt-5.5') },
  { label: 'gpt-5.4',                deps: makeOpenAIDeps('gpt-5.4') },
  { label: 'gpt-4o (legacy)',        deps: makeOpenAIDeps('gpt-4o') },
  { label: 'claude-3-5-sonnet (legacy)', deps: makeAnthropicDeps('claude-3-5-sonnet-20241022') },
  { label: 'claude-haiku (last resort)', deps: makeAnthropicDeps('claude-haiku-4-5-20251001') },
]

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
      ...(typeof s.forceContrastMode === 'string' && ['light','dark','auto'].includes(s.forceContrastMode) ? { forceContrastMode: s.forceContrastMode as CarouselBeat['forceContrastMode'] } : {}),
      ...(typeof s.visualFocusIntent === 'string' && s.visualFocusIntent.trim() ? { visualFocusIntent: s.visualFocusIntent.trim() } : {}),
    }))
  } catch {
    return null
  }
}

// Force the user's exact automation keyword onto the CTA beat. The model is
// instructed to bind it, but we enforce it deterministically so an invented
// keyword (the S422 "CREDIT AUDIT" bug) can never reach the slide.
export function bindAutomationKeyword(beats: CarouselBeat[], keyword: string | null): CarouselBeat[] {
  if (!keyword || !keyword.trim()) return beats
  const kw = keyword.trim()
  return beats.map(b => (b.beat === 'cta' ? { ...b, automationKeyword: kw } : b))
}

function buildFallbackBeats(input: BeatsInput): CarouselBeat[] {
  return bindAutomationKeyword([
    { beat: 'hook', isCover: true, index: 0, title: input.topic, slideComponent: 'cover' },
    { beat: 'value', isCover: false, index: 1, title: input.outcome?.split('\n')[0]?.slice(0, 60) || 'Here is what we do', slideComponent: 'narrative' },
    { beat: 'cta', isCover: false, index: 2, title: 'Follow for more', bottomAnchor: 'Start today', slideComponent: 'cta' },
  ], input.automationKeyword)
}

// ── Prompt construction (system enforces stance; user binds the keyword) ────

function stanceDirective(stance: CarouselStance | null): string {
  if (stance === 'destroy') {
    return [
      `STANCE — DESTROY (enforce in every beat):`,
      `- You are aggressively positioned AGAINST the status quo and competing approaches.`,
      `- Call out the common wrong method by name-of-category and dismantle it.`,
      `- Combative, polarizing, confident. No hedging, no "it depends".`,
      `- The reader should feel the old way is actively costing them.`,
    ].join('\n')
  }
  // default / 'mimic'
  return [
    `STANCE — MIMIC (enforce in every beat):`,
    `- Model the proven winners in this space; reinforce best practice.`,
    `- Authoritative and credible without attacking competitors by name.`,
  ].join('\n')
}

export function buildSystemPrompt(input: BeatsInput): string {
  return [
    `You are an elite direct-response copywriter and Instagram carousel strategist.`,
    `Output ONLY compact JSON: {"slides": [...]}. No commentary, no markdown fences.`,
    ``,
    stanceDirective(input.stance),
    ``,
    `Every slide is a standalone scannable beat, NOT a continuous-read script.`,
  ].join('\n')
}

export function buildUserPrompt(input: BeatsInput): string {
  const kw = input.automationKeyword?.trim()
  return [
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
    `  "proofImageUri": string, // ONLY on payoff/value beats — set to "mock_asset_required" when the beat warrants a testimonial/result image`,
    `  "forceContrastMode": "light"|"dark"|"auto" // set "dark" when the beat reads over a busy/photographic background`,
    `}`,
    ``,
    `HOOK FRAMEWORK — Slide 0 (enforced):`,
    `- Title MUST use exactly one of these 6 frameworks: Question / Shock-Stat / Promise / Step-by-Step / Mistake / Curiosity`,
    `- Title MUST be ≤12 words; output ONE power word in "highlightWord"; slideComponent MUST be "cover"`,
    ``,
    `COMPONENT SELECTION (enforced):`,
    `- "cover": hook slide only (Slide 0 always)`,
    `- "proof": Slide 2 or 3 to deliver payoff early; MUST pair with proofImageUri: "mock_asset_required"`,
    `- "stat_callout": ONLY when the slide's entire point is a single massive number`,
    `- "narrative": default for value and problem beats`,
    `- "cta": FINAL slide ALWAYS — Direct Response Call to Action`,
    ``,
    `CTA AUTOMATION FIELDS (cta beat — all three REQUIRED):`,
    kw
      ? `- "automationKeyword": MUST be EXACTLY "${kw}" — verbatim, uppercase as given. Do NOT invent, rephrase, abbreviate, translate, or substitute any other keyword. Use this exact string.`
      : `- "automationKeyword": 1–3 uppercase words the user types to trigger the Manychat flow`,
    `- "ctaInstagramInstructions": tell users to comment the keyword below; they receive instant DM access`,
    `- "ctaTiktokInstructions": tell users to DM the keyword; they receive instant access via DM`,
    input.ctaObjective ? `- CTA OBJECTIVE: "${input.ctaObjective}" — shape the final CTA beat toward this objective.` : '',
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

// Run one deps generation → parse → zod-validate → bind keyword. Null on any
// failure so the caller can try the next strategy.
async function tryGenerate(input: BeatsInput, deps: BeatsDeps, label: string): Promise<CarouselBeat[] | null> {
  try {
    const raw = await deps.generate({ system: buildSystemPrompt(input), user: buildUserPrompt(input) })
    const parsed = parseBeatResponse(raw)
    if (!parsed) { console.warn(`[generateCarouselBeats] ${label} response invalid`); return null }
    const validated = validateCarouselBeats(parsed)
    if (!validated) { console.warn(`[generateCarouselBeats] ${label} failed schema validation`); return null }
    const bound = bindAutomationKeyword(validated, input.automationKeyword)
    console.info(`[generateCarouselBeats] generated via ${label}`)
    await logGenerationPayload(bound) // dev-only; no-op + non-throwing otherwise
    return bound
  } catch (err) {
    console.warn(`[generateCarouselBeats] ${label} call failed:`, err instanceof Error ? err.message : err)
    return null
  }
}

export async function generateCarouselBeats(
  input: BeatsInput,
  depsOverride?: Partial<BeatsDeps>
): Promise<CarouselBeat[]> {
  // When a deps override is supplied (tests / explicit caller), it is the ONLY
  // strategy. Otherwise: walk the model cascade in strict order.
  if (depsOverride?.generate) {
    const beats = await tryGenerate(input, { generate: depsOverride.generate }, 'override')
    return beats ?? buildFallbackBeats(input)
  }

  for (const tier of STRATEGY_CASCADE) {
    const beats = await tryGenerate(input, tier.deps, tier.label)
    if (beats) return beats
  }

  console.warn('[generateCarouselBeats] all strategies failed, using generic fallback beats')
  return buildFallbackBeats(input)
}
