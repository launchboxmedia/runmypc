# Carousel Pipeline Fix — Beats, Compositing, Animation, Quality Gate

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 4 defects in the carousel pipeline: replace verbatim social-copy slicing with LLM-driven beat planning, fix silent logo/cover compositing failures, convert all slides from static PNG to GSAP-animated MP4, and extend the quality gate to catch rotated/clipped text.

**Architecture:** Beat generation (`generateCarouselBeats`) runs as a standalone Haiku call fed by research data (not social copy), producing structured per-slide fields that `slideHtml.ts` renders as GSAP-timeline HTML documents. The Hyperframes render service (already live) converts each to a 3-second MP4 via its animated mode. Logo compositing gets explicit logging + public-URL fallback so silent null failures surface. Quality gate gets a rotation/clip check extension.

**Tech Stack:** TypeScript, Next.js 14, Anthropic Haiku (claude-haiku-4-5-20251001), Hyperframes render service (HYPERFRAMES_RENDER_URL), Supabase Storage (job-assets bucket), Vitest

---

## File Map

| File | Change |
|---|---|
| `lib/carousel/types.ts` | Add `CarouselBeat`, `SlideBeat` extended, rename `png→buffer` |
| `lib/carousel/generateCarouselBeats.ts` | **Create** — LLM beat planner |
| `lib/carousel/slideHtml.ts` | Rich fields, GSAP timelines, field constraint, fallback |
| `lib/carousel/renderClient.ts` | Add `renderAnimatedSlide` |
| `lib/carousel/qualityGate.ts` | Extend vision prompt |
| `lib/carousel/coverVisual.ts` | Add `onFailure` callback |
| `lib/carousel/buildSlidePlan.ts` | **Delete** (replaced by generateCarouselBeats) |
| `lib/carousel/buildSlidePlan.test.ts` | **Delete** |
| `lib/carousel/generateCarousel.ts` | Accept beats, use animated render, wire failure logging |
| `lib/workflows/content-generation.ts` | Call generateCarouselBeats, fix logo fetch, MP4 upload |
| `components/canvas/ContentSection.tsx` | Video slides in lightbox |

---

## Task 1: Extend types.ts — CarouselBeat + SlideBeat

**Files:**
- Modify: `lib/carousel/types.ts`

- [ ] **Step 1: Write the failing test** (in `lib/carousel/buildSlidePlan.test.ts` — repurpose it as a types smoke test later; skip for now; types have no runtime tests — proceed to step 3)

- [ ] **Step 2: Replace the contents of `lib/carousel/types.ts`**

```typescript
// Phase C carousel generation — shared types.
import type { ResolvedDesignSystem } from '@/lib/designSystem/resolveDesignSystem'

// All beats a carousel slide can carry. 'hook' is always slide 0 (isCover).
// 'problem' and 'payoff' are new beats added by generateCarouselBeats.
export type SlideBeat = 'hook' | 'problem' | 'value' | 'payoff' | 'cta'

// Per-slide beat produced by generateCarouselBeats. Every field except title
// is optional — the model includes only what that beat genuinely needs.
export type CarouselBeat = {
  beat: SlideBeat
  isCover: boolean   // true only for the hook slide (index 0)
  index: number      // 0-based, 0 = cover
  title: string      // required, ≤ ~8 words
  subhead?: string   // ≤ 2 lines
  calloutBox?: string
  bullets?: string[]
  checklist?: string[]
  bottomAnchor?: string
  body?: string      // rare; hard cap 2 lines max
}

export type CarouselSlideResult = {
  index: number
  beat: SlideBeat
  buffer: Buffer     // MP4 bytes (animated render output)
}

export type GenerateCarouselResult = {
  resolved: ResolvedDesignSystem
  slides: CarouselSlideResult[] // ordered; cover first, cta last
}
```

- [ ] **Step 3: Run type check**

```
npx tsc --noEmit
```

Expected: errors in files that still reference the old `SlidePlan` and `.png` field — that's correct, we'll fix them in later tasks.

- [ ] **Step 4: Commit**

```
git add lib/carousel/types.ts
git commit -m "refactor(carousel): extend types — CarouselBeat, SlideBeat, buffer rename"
```

---

## Task 2: Create generateCarouselBeats.ts

**Files:**
- Create: `lib/carousel/generateCarouselBeats.ts`
- Create: `lib/carousel/generateCarouselBeats.test.ts`

### Context

This function replaces `buildSlidePlan`. It calls Haiku with a structured prompt fed by job research data (topic, audience, outcome, research summary) — NOT derived from social copy. It returns `CarouselBeat[]` in beat order: hook→problem→value[]→payoff[]→cta, capped at 12 slides total.

- [ ] **Step 1: Write the failing test**

Create `lib/carousel/generateCarouselBeats.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { generateCarouselBeats, parseBeatResponse, type BeatsInput } from './generateCarouselBeats'

const SAMPLE_INPUT: BeatsInput = {
  topic: 'credit repair',
  audience: 'People with low credit scores who want to buy a house',
  outcome: 'Clean credit profile and transparent process',
  researchContext: 'Reddit posts show people frustrated by collections, errors on reports, want step-by-step guidance',
}

const VALID_BEATS_JSON = JSON.stringify({
  slides: [
    { beat: 'hook', title: 'Your Credit Report Is Lying to You' },
    { beat: 'problem', title: 'Bad Marks Keep You Stuck', subhead: 'Collections. Errors. Outdated accounts.' },
    { beat: 'value', title: 'Step 1: Pull All 3 Reports', bullets: ['AnnualCreditReport.com', 'Free once per year', 'Equifax, Experian, TransUnion'] },
    { beat: 'value', title: 'Step 2: Find What Hurts You', calloutBox: 'Every negative item has an expiration date' },
    { beat: 'payoff', title: '+326 Points in 7 Weeks', subhead: '26 deletions. Every bureau moved.' },
    { beat: 'cta', title: 'Start Your Credit Audit Today', bottomAnchor: 'Follow @creditrize for the breakdown' },
  ]
})

describe('parseBeatResponse', () => {
  it('returns null for invalid JSON', () => {
    expect(parseBeatResponse('not json')).toBeNull()
  })

  it('returns null when slides is missing or empty', () => {
    expect(parseBeatResponse('{}')).toBeNull()
    expect(parseBeatResponse('{"slides":[]}')).toBeNull()
  })

  it('returns null when hook slide is missing', () => {
    const noHook = JSON.stringify({ slides: [{ beat: 'cta', title: 'Follow us' }] })
    expect(parseBeatResponse(noHook)).toBeNull()
  })

  it('parses valid response and assigns index/isCover', () => {
    const beats = parseBeatResponse(VALID_BEATS_JSON)
    expect(beats).not.toBeNull()
    expect(beats![0].beat).toBe('hook')
    expect(beats![0].isCover).toBe(true)
    expect(beats![0].index).toBe(0)
    expect(beats![1].isCover).toBe(false)
    expect(beats![1].index).toBe(1)
  })

  it('enforces 12-slide cap (truncates excess)', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      i === 0 ? { beat: 'hook', title: 'Hook' } :
      i === 19 ? { beat: 'cta', title: 'CTA' } :
      { beat: 'value', title: `Value ${i}` }
    )
    const beats = parseBeatResponse(JSON.stringify({ slides: many }))
    expect(beats!.length).toBeLessThanOrEqual(12)
    expect(beats![beats!.length - 1].beat).toBe('cta')
  })

  it('preserves optional fields when present', () => {
    const beats = parseBeatResponse(VALID_BEATS_JSON)!
    const valueBeat = beats.find(b => b.beat === 'value' && b.bullets)!
    expect(valueBeat.bullets).toEqual(['AnnualCreditReport.com', 'Free once per year', 'Equifax, Experian, TransUnion'])
  })

  it('strips slides with missing or blank title', () => {
    const withBlank = JSON.stringify({
      slides: [
        { beat: 'hook', title: 'Hook' },
        { beat: 'value', title: '' },
        { beat: 'cta', title: 'CTA' },
      ]
    })
    const beats = parseBeatResponse(withBlank)!
    expect(beats.every(b => b.title.trim().length > 0)).toBe(true)
  })
})

describe('generateCarouselBeats', () => {
  it('returns parsed beats from LLM response', async () => {
    const mockGenerate = vi.fn().mockResolvedValue(VALID_BEATS_JSON)
    const beats = await generateCarouselBeats(SAMPLE_INPUT, { generate: mockGenerate })
    expect(beats.length).toBeGreaterThanOrEqual(3)
    expect(beats[0].beat).toBe('hook')
    expect(beats[0].isCover).toBe(true)
    expect(beats[beats.length - 1].beat).toBe('cta')
  })

  it('uses fallback beats when LLM returns invalid JSON', async () => {
    const mockGenerate = vi.fn().mockResolvedValue('garbage response')
    const beats = await generateCarouselBeats(SAMPLE_INPUT, { generate: mockGenerate })
    expect(beats.length).toBeGreaterThanOrEqual(3)
    expect(beats[0].beat).toBe('hook')
    expect(beats[beats.length - 1].beat).toBe('cta')
  })

  it('uses fallback beats when LLM throws', async () => {
    const mockGenerate = vi.fn().mockRejectedValue(new Error('API error'))
    const beats = await generateCarouselBeats(SAMPLE_INPUT, { generate: mockGenerate })
    expect(beats[0].beat).toBe('hook')
  })
})
```

- [ ] **Step 2: Run to verify tests fail**

```
npx vitest run lib/carousel/generateCarouselBeats.test.ts
```

Expected: FAIL with "Cannot find module './generateCarouselBeats'"

- [ ] **Step 3: Create `lib/carousel/generateCarouselBeats.ts`**

```typescript
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

    // Validate and clean slides
    const valid = (parsed.slides as Record<string, unknown>[])
      .filter(s => typeof s === 'object' && s !== null)
      .filter(s => typeof s.title === 'string' && (s.title as string).trim().length > 0)
      .filter(s => VALID_BEATS.includes(s.beat as SlideBeat))
      .slice(0, MAX_SLIDES)

    if (valid.length === 0) return null

    // Must have a hook
    const hasHook = valid.some(s => s.beat === 'hook')
    if (!hasHook) return null

    // Assign index and isCover, enforce cta is last
    const withoutCta = valid.filter(s => s.beat !== 'cta')
    const cta = valid.find(s => s.beat === 'cta')
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

// Deterministic fallback: 3-slide minimum (hook, value, cta) derived from the
// input fields if Haiku returns garbage or throws.
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
```

- [ ] **Step 4: Run tests**

```
npx vitest run lib/carousel/generateCarouselBeats.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: Type check**

```
npx tsc --noEmit
```

Expected: errors in `slideHtml.ts`, `generateCarousel.ts`, etc. — correct, we haven't updated them yet. Zero errors in the new file itself.

- [ ] **Step 6: Commit**

```
git add lib/carousel/generateCarouselBeats.ts lib/carousel/generateCarouselBeats.test.ts
git commit -m "feat(carousel): generateCarouselBeats — LLM beat planner replacing buildSlidePlan"
```

---

## Task 3: Update slideHtml.ts — rich fields, GSAP timelines, constraint

**Files:**
- Modify: `lib/carousel/slideHtml.ts`
- Modify: `lib/carousel/helpers.test.ts` (update imports)

### Context

`slideHtml.ts` currently takes a `SlidePlan` with a single `text: string`. After this task it takes a `CarouselBeat` with optional rich fields. All slides now include GSAP timelines (3-second animated compositions). The Haiku prompt gets a hard constraint: render ONLY fields present in the beat data plus the style's layout elements — no invented chrome. A `isValidSlideComposition` validator and `buildFallbackSlide` function provide the same contract enforcement that `hyperframes.ts` uses for social_video.

The GSAP CDN tag must be added since the current prompt prohibits all external resources. We will explicitly allow ONLY this CDN URL.

The composition ID for carousel slides is `'slide'` (vs `'scene'` for social_video).

- [ ] **Step 1: Replace `lib/carousel/slideHtml.ts` in full**

```typescript
// Generate one carousel slide as a complete standalone HTML document via Haiku.
// All slides are GSAP-timeline animated compositions (3-second loops) — the
// Hyperframes render service seeks the timeline frame-by-frame for MP4 output.
// CSS @keyframes/transition are NOT seeked → frozen; use ONLY GSAP on the tl.
import Anthropic from '@anthropic-ai/sdk'
import { STYLE_LIBRARY, type StyleId } from '@/lib/designSystem/styleLibrary'
import type { ResolvedDesignSystem } from '@/lib/designSystem/resolveDesignSystem'
import type { CarouselBeat } from './types'

const HTML_MODEL = 'claude-haiku-4-5-20251001'
const COVER_TOKEN = '__COVER_VISUAL__'
export const COMPOSITION_ID = 'slide'
export const SLIDE_DURATION = 3   // seconds per slide
const GSAP_CDN = 'https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js'

let _anthropic: Anthropic
function anthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _anthropic
}

export type SlideHtmlDeps = { generate: (prompt: string) => Promise<string> }

const defaultDeps: SlideHtmlDeps = {
  async generate(prompt) {
    const res = await anthropic().messages.create({
      model: HTML_MODEL,
      max_tokens: 2500,
      messages: [{ role: 'user', content: prompt }],
    })
    return res.content[0]?.type === 'text' ? res.content[0].text : ''
  },
}

// A valid slide composition must have the Hyperframes contract elements.
export function isValidSlideComposition(html: string): boolean {
  return (
    html.includes('data-root="true"') &&
    html.includes('window.__timelines') &&
    /gsap\.timeline/.test(html) &&
    html.includes(`"${COMPOSITION_ID}"`)
  )
}

// Safety net: remove NO GLYPH placeholder markers Haiku occasionally emits.
export function stripGlyphPlaceholders(html: string): string {
  const placeholder = /n\s*o[\s\-_]*g\s*l\s*y\s*p\s*h/gi
  return html
    .replace(new RegExp(`<([a-z]+)([^>]*)>\\s*${placeholder.source}\\s*<\\/\\1>`, 'gi'), '')
    .replace(placeholder, '')
}

// Deterministic fallback slide — valid GSAP composition the render service
// will always accept. Used when Haiku generates an invalid composition.
export function buildFallbackSlide(
  beat: CarouselBeat,
  resolved: ResolvedDesignSystem
): string {
  const style = STYLE_LIBRARY[resolved.style_id]
  const bg = resolved.background
  const fg = resolved.primary_color
  const accent = resolved.accent

  const coverBg = beat.isCover
    ? `<img id="cover-bg" src="${COVER_TOKEN}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;" />`
    : ''
  const subhead = beat.subhead
    ? `<div id="subhead" style="font-family:'${style.typography.body_font}',sans-serif;font-size:38px;color:${fg};opacity:0;margin-top:24px;line-height:1.4;">${esc(beat.subhead)}</div>`
    : ''
  const bullets = beat.bullets?.length
    ? `<ul id="bullets" style="list-style:none;padding:0;margin-top:32px;opacity:0;">${beat.bullets.map(b => `<li style="font-family:'${style.typography.body_font}',sans-serif;font-size:34px;color:${fg};padding:8px 0;border-bottom:1px solid ${accent}33;">• ${esc(b)}</li>`).join('')}</ul>`
    : ''
  const checklist = beat.checklist?.length
    ? `<ul id="checklist" style="list-style:none;padding:0;margin-top:32px;opacity:0;">${beat.checklist.map(c => `<li style="font-family:'${style.typography.body_font}',sans-serif;font-size:34px;color:${fg};padding:8px 0;">✓ ${esc(c)}</li>`).join('')}</ul>`
    : ''
  const callout = beat.calloutBox
    ? `<div id="callout" style="border-left:6px solid ${accent};padding:20px 28px;margin-top:32px;opacity:0;font-family:'${style.typography.body_font}',sans-serif;font-size:38px;color:${fg};">${esc(beat.calloutBox)}</div>`
    : ''
  const anchor = beat.bottomAnchor
    ? `<div id="anchor" style="position:absolute;bottom:80px;left:72px;right:72px;font-family:'${style.typography.body_font}',sans-serif;font-size:32px;color:${accent};opacity:0;">${esc(beat.bottomAnchor)}</div>`
    : ''

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1080,height=1350">
<script src="${GSAP_CDN}"></script>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:1080px;height:1350px;overflow:hidden;background:${bg}}
  #${COMPOSITION_ID}{position:relative;width:1080px;height:1350px;background:${bg};overflow:hidden}
</style>
</head>
<body>
<div id="${COMPOSITION_ID}"
  data-composition-id="${COMPOSITION_ID}"
  data-width="1080"
  data-height="1350"
  data-start="0"
  data-duration="${SLIDE_DURATION}"
  data-root="true">
  ${coverBg}
  <div style="position:relative;z-index:1;padding:72px;">
    <div id="title" style="font-family:'${style.typography.display_font}',serif;font-size:72px;font-weight:800;color:${fg};line-height:1.1;opacity:0;">${esc(beat.title)}</div>
    ${subhead}${callout}${bullets}${checklist}${anchor}
  </div>
</div>
<script>
  window.__timelines = window.__timelines || {};
  var tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });
  tl.fromTo("#title", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.7 }, 0.1);
  ${beat.subhead ? `tl.fromTo("#subhead", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5 }, 0.5);` : ''}
  ${beat.calloutBox ? `tl.fromTo("#callout", { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.5 }, 0.7);` : ''}
  ${(beat.bullets || beat.checklist) ? `tl.fromTo("#${beat.bullets ? 'bullets' : 'checklist'}", { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.5 }, 0.8);` : ''}
  ${beat.bottomAnchor ? `tl.fromTo("#anchor", { opacity: 0 }, { opacity: 1, duration: 0.4 }, 1.4);` : ''}
  ${beat.isCover ? `tl.fromTo("#cover-bg", { scale: 1.05 }, { scale: 1, duration: ${SLIDE_DURATION}, ease: "none" }, 0);` : ''}
  tl.to("#${COMPOSITION_ID}", { opacity: 1, duration: 0.01 }, ${SLIDE_DURATION});
  window.__timelines["${COMPOSITION_ID}"] = tl;
</script>
</body>
</html>`
}

function esc(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Deterministically stamp a brand logo into the bottom-left corner of a slide.
// Uses position:fixed relative to the render viewport. Returns html unchanged
// when there is no logo.
export function stampLogo(html: string, logoDataUri: string | null | undefined): string {
  if (!logoDataUri) return html
  const mark = `<img src="${logoDataUri}" alt="" style="position:fixed;bottom:44px;left:44px;height:56px;width:auto;max-width:200px;object-fit:contain;z-index:2147483647;pointer-events:none;" />`
  const idx = html.toLowerCase().lastIndexOf('</body>')
  if (idx === -1) return html + mark
  return html.slice(0, idx) + mark + html.slice(idx)
}

// Pull the HTML document out of any markdown fences / stray prose Haiku adds.
export function extractHtml(raw: string): string {
  const fenced = raw.match(/```(?:html)?\s*([\s\S]*?)```/i)
  const body = fenced ? fenced[1] : raw
  const docMatch = body.match(/<!doctype[\s\S]*$/i) || body.match(/<html[\s\S]*<\/html>/i)
  return (docMatch ? docMatch[0] : body).trim()
}

function buildPrompt(input: {
  resolved: ResolvedDesignSystem
  beat: CarouselBeat
  handle?: string
  hasCoverVisual: boolean
  hasLogo: boolean
  retryNote?: string
}): string {
  const { resolved, beat, handle, hasCoverVisual, hasLogo, retryNote } = input
  const style = STYLE_LIBRARY[resolved.style_id]

  // Build the beat-fields block — only include fields present in beat data.
  // This is the single source of truth for what the HTML should contain.
  const beatFields = [
    `title (REQUIRED): "${esc(beat.title)}"`,
    beat.subhead ? `subhead: "${esc(beat.subhead)}"` : null,
    beat.calloutBox ? `calloutBox: "${esc(beat.calloutBox)}"` : null,
    beat.bullets?.length ? `bullets: ${JSON.stringify(beat.bullets)}` : null,
    beat.checklist?.length ? `checklist: ${JSON.stringify(beat.checklist)}` : null,
    beat.bottomAnchor ? `bottomAnchor: "${esc(beat.bottomAnchor)}"` : null,
    beat.body ? `body: "${esc(beat.body)}"` : null,
  ].filter(Boolean).join('\n')

  const coverInstruction = beat.isCover && hasCoverVisual
    ? `- A background visual is provided. Include exactly one <img id="cover-bg" src="${COVER_TOKEN}"> as the slide backdrop (position:absolute, inset:0, object-fit:cover, z-index:0). ${
        resolved.split_image_cover
          ? `SPLIT LAYOUT: image fills one half; solid ${resolved.background} block fills the other for headline.`
          : `Image is the backdrop; place headline over a legible zone with scrim/overlay if needed.`
      } Do NOT put a data-URI in the src — use the literal token ${COVER_TOKEN}.`
    : beat.isCover
      ? `- No background image. Strong type-driven cover on the ${resolved.background} background.`
      : `- No images (no cover token, no img tags for decoration).`

  return [
    `Output ONLY a complete standalone HTML document for ONE Instagram carousel slide. No commentary, no markdown fences.`,
    ``,
    `NON-NEGOTIABLE CONTRACT (breaking any of these makes the slide a frozen frame or fails QA):`,
    `- Load GSAP exactly: <script src="${GSAP_CDN}"></script> — this is the ONLY allowed external resource.`,
    `- Root element MUST have: id="${COMPOSITION_ID}" data-composition-id="${COMPOSITION_ID}" data-width="1080" data-height="1350" data-start="0" data-duration="${SLIDE_DURATION}" data-root="true".`,
    `- ALL motion MUST be driven by ONE paused GSAP timeline: gsap.timeline({paused:true}). Do NOT use CSS @keyframes/animation/transition — they produce a frozen frame.`,
    `- Register the timeline: window.__timelines = window.__timelines || {}; window.__timelines["${COMPOSITION_ID}"] = tl;`,
    `- Timeline total length MUST reach ${SLIDE_DURATION}s (add a trailing tween: tl.to("#${COMPOSITION_ID}",{opacity:1,duration:0.01},${SLIDE_DURATION})).`,
    `- Canvas exactly 1080×1350px. Overflow hidden.`,
    ``,
    `SLIDE ROLE: ${beat.beat.toUpperCase()} (${beat.isCover ? 'cover — slide 0' : `slide ${beat.index}`})`,
    handle && beat.isCover ? `Brand handle: show as @${handle} on the cover only.` : '',
    ``,
    `BEAT CONTENT — render EXACTLY these fields, nothing else invented:`,
    beatFields,
    ``,
    `HARD CONSTRAINT ON CONTENT: Render ONLY the fields listed above. Do NOT invent supplementary UI elements — no extra badges, tags, icons, decorative pills, extra callouts, or motivational copy that isn't in the beat data. The style layout elements (page indicator, handle pill, hook device described below) are permitted, but only if they do not displace or distort the required fields.`,
    ``,
    `DESIGN SYSTEM — ${style.display_name}:`,
    `- Background: ${resolved.background}. Primary/text: ${resolved.primary_color}. Accent: ${resolved.accent}.`,
    `- Fonts: ONLY "${style.typography.display_font}" for headlines and "${style.typography.body_font}" for body/bullets. No @import, no Google Fonts, no external CSS.`,
    `- Typography: ${style.typography.treatment}`,
    `- Layout: ${style.layout_descriptor}`,
    `- Hook device (cover only, if beat is hook): ${style.hook_technique}`,
    coverInstruction,
    hasLogo ? `- A brand logo will be stamped in the BOTTOM-LEFT corner (~210×90px area). Keep that corner clear — no text, page dots, or key elements there.` : '',
    `- All text inside ≥64px safe margin, fully visible, never clipped or overflowing.`,
    `- Draw icons/graphics with pure CSS or inline SVG only — no icon fonts, no emoji-as-icon, no placeholder text.`,
    retryNote ? `\nPREVIOUS RENDER FAILED QA: ${retryNote}\nFix specifically: ${retryNote}` : '',
  ].filter(Boolean).join('\n')
}

export async function generateSlideHtml(
  input: {
    resolved: ResolvedDesignSystem
    beat: CarouselBeat
    handle?: string
    coverVisualDataUri?: string | null
    logoDataUri?: string | null
    retryNote?: string
  },
  deps: SlideHtmlDeps = defaultDeps
): Promise<string> {
  const hasCoverVisual = Boolean(input.beat.isCover && input.coverVisualDataUri)
  const hasLogo = Boolean(input.logoDataUri)
  const prompt = buildPrompt({
    resolved: input.resolved,
    beat: input.beat,
    handle: input.handle,
    hasCoverVisual,
    hasLogo,
    retryNote: input.retryNote,
  })

  const raw = await deps.generate(prompt)
  let html = stripGlyphPlaceholders(extractHtml(raw))

  // If Haiku produced something that won't animate, fall back to the
  // deterministic template rather than delivering a frozen frame.
  if (!isValidSlideComposition(html)) {
    console.warn(`[slideHtml] invalid composition for beat ${input.beat.index} (${input.beat.beat}), using fallback`)
    html = buildFallbackSlide(input.beat, input.resolved)
  }

  // Inject cover visual data-URI (cover slide only).
  if (hasCoverVisual && input.coverVisualDataUri) {
    html = html.split(COVER_TOKEN).join(input.coverVisualDataUri)
  } else {
    html = html.replace(/<img[^>]*id=["']cover-bg["'][^>]*>/gi, '').split(COVER_TOKEN).join('')
  }

  // Deterministic brand-mark stamp (bottom-left), independent of Haiku.
  html = stampLogo(html, input.logoDataUri)

  return html
}
```

- [ ] **Step 2: Update `lib/carousel/helpers.test.ts`** — the imports still work (`stampLogo`, `stripGlyphPlaceholders`, `extractHtml` are still exported). The test for `stampLogo` verifies `bottom:44px` which is still correct. No changes needed to the test file itself.

- [ ] **Step 3: Run existing helper tests**

```
npx vitest run lib/carousel/helpers.test.ts
```

Expected: all PASS (same exported functions, same behavior)

- [ ] **Step 4: Type check**

```
npx tsc --noEmit
```

Expected: errors in `generateCarousel.ts` (still uses old `SlidePlan` type) — correct. No errors in `slideHtml.ts` itself.

- [ ] **Step 5: Commit**

```
git add lib/carousel/slideHtml.ts
git commit -m "feat(carousel): GSAP timelines + rich beat fields + content constraint in slideHtml"
```

---

## Task 4: Add renderAnimatedSlide to renderClient.ts

**Files:**
- Modify: `lib/carousel/renderClient.ts`

### Context

The animated render mode POSTs to the same `HYPERFRAMES_RENDER_URL` endpoint but without `render_mode:"static"`, sending `fps` and `durationInSeconds` instead. The response contains a URL pointing to the rendered MP4, which we fetch and return as a Buffer (same pattern as static). Slide duration is `SLIDE_DURATION = 3` seconds, 30 fps.

- [ ] **Step 1: Add `renderAnimatedSlide` to `lib/carousel/renderClient.ts`**

Append after the existing `renderStaticPng` and its helpers:

```typescript
// Animated render: drives GSAP timeline frame-by-frame, returns MP4 Buffer.
// Duration and fps must match the HTML's data-duration attribute.
export async function renderAnimatedSlide(
  html: string,
  width = 1080,
  height = 1350,
  durationSeconds = 3,
  fps = 30,
  timeoutMs = 120000
): Promise<Buffer> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= MAX_RENDER_ATTEMPTS; attempt++) {
    try {
      return await renderAnimatedOnce(html, width, height, durationSeconds, fps, timeoutMs)
    } catch (e) {
      lastErr = e
      if (!isTransient(e) || attempt === MAX_RENDER_ATTEMPTS) throw e
      await new Promise(r => setTimeout(r, 400 * attempt))
    }
  }
  throw lastErr
}

async function renderAnimatedOnce(
  html: string,
  width: number,
  height: number,
  durationSeconds: number,
  fps: number,
  timeoutMs: number
): Promise<Buffer> {
  const url = process.env.HYPERFRAMES_RENDER_URL
  if (!url) throw new Error('HYPERFRAMES_RENDER_URL not configured')

  const fetchSignal = () => AbortSignal.timeout(timeoutMs)

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html, width, height, fps, durationInSeconds: durationSeconds }),
      signal: fetchSignal(),
    })
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') throw new Error(`Animated render timed out after ${timeoutMs}ms`)
    throw e
  }

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`Animated render failed (${res.status}): ${err.slice(0, 300)}`)
  }

  const data = (await res.json()) as { url?: string; error?: string }
  if (!data.url) throw new Error(`Animated render returned no url: ${data.error || 'unknown'}`)

  let mp4Res: Response
  try {
    mp4Res = await fetch(data.url, { signal: fetchSignal() })
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') throw new Error(`Rendered MP4 fetch timed out after ${timeoutMs}ms`)
    throw e
  }
  if (!mp4Res.ok) throw new Error(`Failed to fetch rendered MP4 (${mp4Res.status})`)
  return Buffer.from(await mp4Res.arrayBuffer())
}
```

(Keep all existing `renderStaticPng` and `renderOnce` code intact — static mode is still used by the quality gate.)

- [ ] **Step 2: Type check**

```
npx tsc --noEmit
```

Expected: errors in `generateCarousel.ts` still, none in `renderClient.ts`.

- [ ] **Step 3: Commit**

```
git add lib/carousel/renderClient.ts
git commit -m "feat(carousel): renderAnimatedSlide — animated MP4 mode via Hyperframes"
```

---

## Task 5: Extend qualityGate.ts — rotation/clipping check

**Files:**
- Modify: `lib/carousel/qualityGate.ts`
- Create: `lib/carousel/qualityGate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/carousel/qualityGate.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { checkSlide } from './qualityGate'
import type { CarouselBeat } from './types'

const DUMMY_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const HOOK_BEAT: CarouselBeat = {
  beat: 'hook',
  isCover: true,
  index: 0,
  title: 'Your Credit Report Is Lying to You',
}

const CTA_BEAT: CarouselBeat = {
  beat: 'cta',
  isCover: false,
  index: 5,
  title: 'Follow Us for the Breakdown',
  bottomAnchor: 'Start today',
}

describe('checkSlide', () => {
  it('returns pass when vision says pass', async () => {
    const deps = { vision: vi.fn().mockResolvedValue({ pass: true, issues: '' }) }
    const result = await checkSlide(DUMMY_PNG, HOOK_BEAT, deps)
    expect(result.pass).toBe(true)
    expect(result.issues).toBe('')
  })

  it('returns fail with issues when vision says fail', async () => {
    const deps = { vision: vi.fn().mockResolvedValue({ pass: false, issues: 'CTA text rotated 90deg, illegible' }) }
    const result = await checkSlide(DUMMY_PNG, CTA_BEAT, deps)
    expect(result.pass).toBe(false)
    expect(result.issues).toContain('rotated')
  })

  it('fails open (pass=true) on vision error', async () => {
    const deps = { vision: vi.fn().mockRejectedValue(new Error('vision API down')) }
    const result = await checkSlide(DUMMY_PNG, HOOK_BEAT, deps)
    expect(result.pass).toBe(true)
  })

  it('calls vision with beat context in the prompt', async () => {
    const mockVision = vi.fn().mockResolvedValue({ pass: true, issues: '' })
    const deps = { vision: mockVision }
    await checkSlide(DUMMY_PNG, CTA_BEAT, deps)
    // Verify the beat info was forwarded (vision fn receives both png and beat)
    expect(mockVision).toHaveBeenCalledWith(DUMMY_PNG, CTA_BEAT)
  })
})
```

- [ ] **Step 2: Run to verify tests fail**

```
npx vitest run lib/carousel/qualityGate.test.ts
```

Expected: FAIL — `checkSlide` takes `SlidePlan` not `CarouselBeat` (type error at test time)

- [ ] **Step 3: Replace `lib/carousel/qualityGate.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests**

```
npx vitest run lib/carousel/qualityGate.test.ts
```

Expected: all PASS

- [ ] **Step 5: Commit**

```
git add lib/carousel/qualityGate.ts lib/carousel/qualityGate.test.ts
git commit -m "feat(carousel): qualityGate extended — rotation/clipping/compression check + CarouselBeat"
```

---

## Task 6: Add failure logging to coverVisual.ts

**Files:**
- Modify: `lib/carousel/coverVisual.ts`

### Context

`resolveCoverVisual` currently returns `null` on any failure with no logging. Add an `onFailure` callback so callers can surface the failure (log it, write it to job_steps, etc.).

- [ ] **Step 1: Update `lib/carousel/coverVisual.ts`**

Change the `resolveCoverVisual` signature and add logging:

```typescript
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
  ].filter(Boolean).join(' ')
}

export async function resolveCoverVisual(
  input: {
    resolved: ResolvedDesignSystem
    topic: string
    audience?: string | null
    selectedAssetUrl?: string | null
    onFailure?: (reason: string) => void
  },
  depsOverride?: Partial<CoverVisualDeps>
): Promise<{ dataUri: string } | null> {
  const deps = { ...defaults, ...depsOverride }
  const { resolved, topic, audience, selectedAssetUrl, onFailure } = input

  const fail = (reason: string): null => {
    console.warn(`[coverVisual] resolveCoverVisual failed: ${reason}`)
    onFailure?.(reason)
    return null
  }

  // 1. Selected approved asset wins — no generation, no scoring.
  if (selectedAssetUrl) {
    try {
      const buf = await fetchBuffer(selectedAssetUrl)
      return { dataUri: toDataUri(buf) }
    } catch (err) {
      // fall through to generation — log but don't fail hard
      console.warn(`[coverVisual] selected asset fetch failed (${err instanceof Error ? err.message : err}), falling through to generation`)
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

    if (urls.length === 0) {
      const reasons = results
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map(r => r.reason instanceof Error ? r.reason.message : String(r.reason))
      return fail(`all ${COVER_VARIANTS} image generation calls failed: ${reasons.join('; ')}`)
    }

    const buffers = (await Promise.allSettled(urls.map(fetchBuffer)))
      .filter((r): r is PromiseFulfilledResult<Buffer> => r.status === 'fulfilled')
      .map(r => r.value)

    if (buffers.length === 0) return fail('image URL fetch failed after generation succeeded')
    if (buffers.length === 1) return { dataUri: toDataUri(buffers[0]) }

    const best = await deps.pickBestVisual(buffers, { topic, styleId: resolved.style_id })
    return { dataUri: toDataUri(buffers[best] ?? buffers[0]) }
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}
```

- [ ] **Step 2: Type check**

```
npx tsc --noEmit
```

Expected: clean or only errors in `generateCarousel.ts` (still being fixed).

- [ ] **Step 3: Commit**

```
git add lib/carousel/coverVisual.ts
git commit -m "feat(carousel): coverVisual — onFailure callback, explicit logging on null return"
```

---

## Task 7: Rewrite generateCarousel.ts — beats, animated render, failure wiring

**Files:**
- Modify: `lib/carousel/generateCarousel.ts`
- Delete: `lib/carousel/buildSlidePlan.ts`
- Delete: `lib/carousel/buildSlidePlan.test.ts`

### Context

`generateCarousel` now accepts `beats: CarouselBeat[]` instead of `igPost`. `buildSlidePlan` is deleted. The quality gate uses `renderStaticPng` (existing) for the check PNG; the final output uses `renderAnimatedSlide` (new). The `onCoverVisualFailure` callback is threaded through to `resolveCoverVisual`.

- [ ] **Step 1: Delete the obsolete files**

```
git rm lib/carousel/buildSlidePlan.ts lib/carousel/buildSlidePlan.test.ts
```

- [ ] **Step 2: Replace `lib/carousel/generateCarousel.ts`**

```typescript
// Phase C orchestrator. Takes pre-planned beats (from generateCarouselBeats),
// resolves the design system, resolves a cover visual, then for each beat
// generates animated GSAP HTML, quality-gates it with a static PNG check,
// and renders the final output as an animated MP4 via the Hyperframes service.
import { resolveDesignSystem, type ResolvedDesignSystem } from '@/lib/designSystem/resolveDesignSystem'
import { resolveCoverVisual } from './coverVisual'
import { generateSlideHtml } from './slideHtml'
import { renderStaticPng, renderAnimatedSlide } from './renderClient'
import { checkSlide } from './qualityGate'
import { mapWithConcurrency } from './concurrency'
import type { CarouselBeat, CarouselSlideResult, GenerateCarouselResult } from './types'
import { SLIDE_DURATION } from './slideHtml'

const MAX_RETRIES = 2
const SLIDE_CONCURRENCY = 4

type JobInput = {
  id: string
  topic: string
  target_audience?: string | null
  outcome?: string | null
  style_id?: string | null
  primary_color?: string | null
  split_image_cover?: boolean | null
}
type ProfileInput = {
  style_id?: string | null
  primary_color?: string | null
  split_image_cover?: boolean | null
  instagram_handle?: string | null
} | null

export async function generateCarousel(input: {
  job: JobInput
  profile: ProfileInput
  beats: CarouselBeat[]
  selectedAssetUrl?: string | null
  logoDataUri?: string | null
  resolved?: ResolvedDesignSystem
  onCoverVisualFailure?: (reason: string) => void
}): Promise<GenerateCarouselResult> {
  const { job, profile, beats, selectedAssetUrl } = input

  const resolved = input.resolved ?? await resolveDesignSystem({
    job: {
      style_id: job.style_id,
      primary_color: job.primary_color,
      split_image_cover: job.split_image_cover,
      topic: job.topic,
      target_audience: job.target_audience,
      outcome: job.outcome,
    },
    profile: profile
      ? { style_id: profile.style_id, primary_color: profile.primary_color, split_image_cover: profile.split_image_cover }
      : null,
  })

  const handle = profile?.instagram_handle || undefined
  const logoDataUri = input.logoDataUri ?? null

  // Start cover visual generation early (slow path) so body beats can render
  // in parallel while the image model works.
  const coverBeat = beats.find(b => b.isCover)
  const bodyBeats = beats.filter(b => !b.isCover)

  const coverVisualPromise = resolveCoverVisual({
    resolved,
    topic: job.topic,
    audience: job.target_audience,
    selectedAssetUrl,
    onFailure: input.onCoverVisualFailure,
  })

  // Cover slide waits for visual, then renders.
  const coverPromise: Promise<CarouselSlideResult | null> = coverBeat
    ? coverVisualPromise.then(async cover => ({
        index: coverBeat.index,
        beat: coverBeat.beat,
        buffer: await renderBeatWithGate(coverBeat, resolved, cover?.dataUri ?? null, handle, logoDataUri),
      }))
    : Promise.resolve(null)

  // Body beats render concurrently (bounded) — no dependency on cover visual.
  const bodyPromise = mapWithConcurrency(bodyBeats, SLIDE_CONCURRENCY, async beat => ({
    index: beat.index,
    beat: beat.beat,
    buffer: await renderBeatWithGate(beat, resolved, null, handle, logoDataUri),
  }))

  const [coverResult, bodyResults] = await Promise.all([coverPromise, bodyPromise])

  const slides = [...(coverResult ? [coverResult] : []), ...bodyResults].sort((a, b) => a.index - b.index)

  return { resolved, slides }
}

async function renderBeatWithGate(
  beat: CarouselBeat,
  resolved: ResolvedDesignSystem,
  coverVisualDataUri: string | null,
  handle: string | undefined,
  logoDataUri: string | null
): Promise<Buffer> {
  let retryNote: string | undefined
  let lastHtml = ''

  // HTML generation loop: quality-gate each attempt using a static PNG check.
  // Final attempt skips the gate and always proceeds to animated render.
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const html = await generateSlideHtml({
      resolved,
      beat,
      handle,
      coverVisualDataUri: beat.isCover ? coverVisualDataUri : null,
      logoDataUri,
      retryNote,
    })
    lastHtml = html

    if (attempt < MAX_RETRIES) {
      // Static PNG gate: faster than animated render, compatible with vision model.
      const gatePng = await renderStaticPng(html)
      const qa = await checkSlide(gatePng, beat)
      if (qa.pass) break
      retryNote = qa.issues
    }
  }

  // Final output: animated MP4 via Hyperframes.
  return renderAnimatedSlide(lastHtml, 1080, 1350, SLIDE_DURATION)
}
```

- [ ] **Step 3: Run type check**

```
npx tsc --noEmit
```

Expected: errors now only in `content-generation.ts` (still passes `igPost`, expects `.png` on results). Zero errors in `generateCarousel.ts` itself.

- [ ] **Step 4: Update `lib/carousel/liveVerify.test.ts`** — uses old `igPost` + `s.png` API.

Find the `generateCarousel` call and replace:
```typescript
    // OLD — delete this
    const result = await generateCarousel({
      ...
      igPost,
      ...
    })
    // and: writeFileSync(p, s.png)
```

Replace with:
```typescript
    const { generateCarouselBeats } = await import('./generateCarouselBeats')
    const beats = await generateCarouselBeats({
      topic: 'speed up a slow Windows PC',
      audience: 'everyday PC owners',
      outcome: 'a faster computer',
      researchContext: 'Users want step-by-step guidance on cleaning up startup programs and background apps.',
    })

    const result = await generateCarousel({
      job: {
        id: 'verify-job',
        topic: 'speed up a slow Windows PC',
        target_audience: 'everyday PC owners',
        outcome: 'a faster computer',
        style_id: styleId,
        primary_color: primaryColor,
        split_image_cover: split ?? false,
      },
      profile: { instagram_handle: 'runmypc' },
      beats,
      selectedAssetUrl: assetUrl ?? null,
      logoDataUri: logo ? LOGO_DATA_URI : null,
    })
```

Also update the file-write loop — `s.png` → `s.buffer`, extension `.png` → `.mp4`:
```typescript
    for (const s of result.slides) {
      const p = resolve(dir, `slide-${s.index + 1}-${s.beat}.mp4`)
      writeFileSync(p, s.buffer)
      console.log('WROTE', p, `${s.buffer.length} bytes`)
    }
```

Remove the now-unused `igPost` constant at the top of the test file.

- [ ] **Step 5: Commit**

```
git add lib/carousel/generateCarousel.ts lib/carousel/liveVerify.test.ts
git commit -m "feat(carousel): wire beats + animated MP4 render + cover failure callback"
```

---

## Task 8: Fix content-generation.ts — logo fetch, research pass-through, MP4 upload

**Files:**
- Modify: `lib/workflows/content-generation.ts` (carousel block only, ~lines 770–895)

### Context

Three changes in this file:

**A) Logo fix:** `toDataUri` is silently returning null when the signed-URL fetch fails. Add explicit logging and a public-URL fallback. Since `profiles.logo_url` is a public storage URL, we can construct the public URL from the file path and the Supabase project URL as a fallback if signed-URL fetch fails.

**B) Research pass-through:** Call `generateCarouselBeats` with `job.topic`, `job.target_audience`, `job.outcome`, and a research summary built from `selectedTopics` (already in scope). Pass the resulting `beats` to `generateCarousel` instead of `igPost`.

**C) MP4 upload:** Change `slide-${i+1}.png` to `slide-${i+1}.mp4`, contentType to `'video/mp4'`, and field on result from `.png` to `.buffer`.

- [ ] **Step 1: Find the `toDataUri` closure (around line 793) and replace it**

Find:
```typescript
        const toDataUri = async (filePath: string): Promise<string | null> => {
          const { data: signed } = await supabase.storage.from('job-assets').createSignedUrl(filePath, 3600)
          if (!signed?.signedUrl) return null
          try {
            const res = await fetch(signed.signedUrl)
            if (!res.ok) return null
            const buf = Buffer.from(await res.arrayBuffer())
            const mime = res.headers.get('content-type') || 'image/png'
            return `data:${mime};base64,${buf.toString('base64')}`
          } catch { return null }
        }
```

Replace with:
```typescript
        // Fetch a job-assets file as a base64 data-URI. The render lambda has
        // no guaranteed network egress so images must be embedded.
        // Falls back to the public URL if the signed-URL fetch fails — logos
        // uploaded via sync-logo live at a public path in the job-assets bucket.
        const toDataUri = async (filePath: string): Promise<string | null> => {
          const { data: signed, error: signError } = await supabase.storage
            .from('job-assets')
            .createSignedUrl(filePath, 3600)
          const primaryUrl = signed?.signedUrl
          // Public-URL fallback for brand-mark files (uploaded to public paths).
          const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/job-assets/${filePath}`
          const urlToFetch = primaryUrl || publicUrl

          if (!primaryUrl) {
            console.warn(`[carousel] createSignedUrl failed for ${filePath}: ${signError?.message} — trying public URL`)
          }
          try {
            const res = await fetch(urlToFetch)
            if (!res.ok) {
              console.warn(`[carousel] toDataUri fetch failed (${res.status}) for path=${filePath} url=${urlToFetch.slice(0, 80)}`)
              return null
            }
            const buf = Buffer.from(await res.arrayBuffer())
            const mime = res.headers.get('content-type') || 'image/png'
            return `data:${mime};base64,${buf.toString('base64')}`
          } catch (err) {
            console.warn(`[carousel] toDataUri fetch threw for path=${filePath}:`, err instanceof Error ? err.message : err)
            return null
          }
        }
```

- [ ] **Step 2: Add logo null warning after the logo fetch (around line 808)**

After:
```typescript
        const logoDataUri = logoAsset?.file_path ? await toDataUri(logoAsset.file_path) : null
```

Add:
```typescript
        if (logoAsset?.file_path && !logoDataUri) {
          console.warn(`[carousel] logo data-URI is null for job ${jobId} — slides will render without brand mark. Asset path: ${logoAsset.file_path}`)
        }
```

- [ ] **Step 3: Add `generateCarouselBeats` call and replace `igPost` construction**

Find the block:
```typescript
        // Phase C: design-system carousel — resolve style, plan dynamic slides
        // (cover=hook first, single CTA last), generate per-slide HTML, render
        // PNGs via the static render service, quality-gate with retries.
        const { generateCarousel } = await import('@/lib/carousel/generateCarousel')
        const result = await generateCarousel({
          job,
          profile,
          igPost: {
            hook: instParsed.hook || primaryTopic,
            body: instParsed.body || '',
            cta: instParsed.cta || 'Follow for more',
          },
          selectedAssetUrl,
          logoDataUri, // brand mark stamped on every slide
          resolved: resolvedDesign, // Phase D: reuse the once-resolved system
        })
```

Replace with:
```typescript
        // Phase C-1: generate carousel beats from research data (not social copy).
        // selectedTopics and primaryTopic are in scope from the research step above.
        const researchContext = selectedTopics
          .slice(0, 5)
          .map((t: { title?: string; body?: string }) => [t.title, t.body].filter(Boolean).join(': '))
          .join('\n')

        const { generateCarouselBeats } = await import('@/lib/carousel/generateCarouselBeats')
        const beats = await generateCarouselBeats({
          topic: job.topic,
          audience: job.target_audience,
          outcome: job.outcome,
          researchContext,
        })

        // Phase C-2: generate per-beat HTML, quality-gate, render animated MP4.
        const { generateCarousel } = await import('@/lib/carousel/generateCarousel')
        const result = await generateCarousel({
          job,
          profile,
          beats,
          selectedAssetUrl,
          logoDataUri,
          resolved: resolvedDesign,
          onCoverVisualFailure: async (reason) => {
            console.warn(`[carousel] cover visual failed for job ${jobId}: ${reason}`)
            await supabase.from('job_steps')
              .update({ error: `Cover image generation failed: ${reason}` })
              .eq('job_id', jobId)
              .eq('step_key', 'generate-instagram-carousel')
          },
        })
```

- [ ] **Step 4: Update the upload loop to use .mp4**

Find:
```typescript
        for (let i = 0; i < result.slides.length; i++) {
          const filename = `${job.user_id}/${jobId}/carousel/slide-${i + 1}.png`

          const { error } = await supabase.storage
            .from('job-assets')
            .upload(filename, result.slides[i].png, { contentType: 'image/png', upsert: true })
```

Replace with:
```typescript
        for (let i = 0; i < result.slides.length; i++) {
          const filename = `${job.user_id}/${jobId}/carousel/slide-${i + 1}.mp4`

          const { error } = await supabase.storage
            .from('job-assets')
            .upload(filename, result.slides[i].buffer, { contentType: 'video/mp4', upsert: true })
```

- [ ] **Step 5: Run type check**

```
npx tsc --noEmit
```

Expected: PASS (zero errors across the whole project)

- [ ] **Step 6: Commit**

```
git add lib/workflows/content-generation.ts
git commit -m "fix(carousel): logo fetch logging + public URL fallback; research beats; MP4 upload"
```

---

## Task 9: Update ContentSection.tsx — video slides in carousel lightbox

**Files:**
- Modify: `components/canvas/ContentSection.tsx`

### Context

Carousel slides are now `.mp4` files. The lightbox currently renders `<img>` for each slide. We need to detect whether a slide URL is a video (`.mp4` in path or signed URL) and render `<video autoPlay loop muted playsInline>` for those. The gallery thumbnail row also needs updating. Keep backward compatibility for any existing PNG slides still in the DB.

- [ ] **Step 1: Add a helper to detect video URLs and update the lightbox image tag**

Find the lightbox `<img>` tag (around line 410):

```tsx
          <img
            src={lightbox.urls[lightbox.index]}
            alt={`Slide ${lightbox.index + 1}`}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[88vh] max-w-[92vw] w-auto object-contain rounded-xl border border-gray-800 shadow-2xl"
          />
```

Replace with:

```tsx
          {(() => {
            const url = lightbox.urls[lightbox.index]
            const isVideo = /\.mp4(\?|$)/i.test(url) || /video/i.test(url)
            return isVideo ? (
              <video
                src={url}
                autoPlay
                loop
                muted
                playsInline
                onClick={(e) => e.stopPropagation()}
                className="max-h-[88vh] max-w-[92vw] w-auto object-contain rounded-xl border border-gray-800 shadow-2xl"
              />
            ) : (
              <img
                src={url}
                alt={`Slide ${lightbox.index + 1}`}
                onClick={(e) => e.stopPropagation()}
                className="max-h-[88vh] max-w-[92vw] w-auto object-contain rounded-xl border border-gray-800 shadow-2xl"
              />
            )
          })()}
```

- [ ] **Step 2: Find the gallery thumbnail row (where slide URLs render as `<img>` thumbnails in the grid)**

Read `ContentSection.tsx` around line 162–200 to find the gallery thumbnail rendering. Look for any `<img>` inside the carousel gallery click-to-open block. For each thumbnail, apply the same video-detection logic:

Find the gallery thumbnail `<img>` (it will be inside the `slideUrls.map(...)` block). Replace with:

```tsx
{/* Inside slideUrls.map((url, idx) => ( ... )) */}
{(() => {
  const isVideo = /\.mp4(\?|$)/i.test(url) || /video/i.test(url)
  return isVideo ? (
    <video
      src={url}
      muted
      className="w-full h-full object-cover"
    />
  ) : (
    <img
      src={url}
      alt={`Slide ${idx + 1}`}
      className="w-full h-full object-cover"
    />
  )
})()}
```

(Read the actual surrounding code before editing to match the exact class names and structure.)

- [ ] **Step 3: Type check**

```
npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 4: Commit**

```
git add components/canvas/ContentSection.tsx
git commit -m "feat(ui): carousel lightbox handles video slides (.mp4) with autoplay loop"
```

---

## Task 10: Diagnostic — screenshot existing slides, verify Fix 2

**Files:** none (read-only diagnostic + verification)

### Context

Use Playwright to fetch and screenshot slide-1 from job 903500bd-09cf-44bb-989d-af647d5fa8c1 to verify the state BEFORE vs AFTER the fix. Generate a fresh signed URL from Supabase (the stored ones expire after 1 hour).

- [ ] **Step 1: Generate a fresh signed URL for slide-1**

Run this SQL in Supabase (use `mcp__claude_ai_Supabase__execute_sql`, project_id `limscrtqcpequuzgmpde`):

```sql
SELECT storage.foldername(name), name
FROM storage.objects
WHERE bucket_id = 'job-assets'
  AND name LIKE '617ed0e9%/903500bd%/carousel/slide-1%'
LIMIT 1;
```

Then use the admin client to create a signed URL for the found path and open it in Playwright. If the SQL returns a result, navigate to the public URL directly:

```
https://limscrtqcpequuzgmpde.supabase.co/storage/v1/object/public/job-assets/617ed0e9-dd6f-41e9-a7a5-5782ec443630/903500bd-09cf-44bb-989d-af647d5fa8c1/carousel/slide-1.png
```

(Note: this is a signed-only bucket so the public URL may 401; use the signed URL from the DB instead.)

- [ ] **Step 2: Screenshot and inspect**

Use Playwright `browser_navigate` → `browser_take_screenshot` on the signed URL.

Report:
- Is a cover photo/background visible?
- Is the creditrize logo visible in the bottom-left?
- What text is visible?
- Is any text rotated, clipped, or in a vertical pill?

This is the baseline. The after-fix test in Task 11 will compare against this.

---

## Task 11: End-to-end verification

**Context:** Run a full carousel generation to verify all 4 fixes work together. Re-trigger the carousel for job 903500bd-09cf-44bb-989d-af647d5fa8c1 using the existing `trigger-carousel` utility or by running a new job for credit repair / Premium & Editorial.

- [ ] **Step 1: Trigger a carousel re-generation**

Either use the Supabase-based re-trigger utility from the previous session or start a new job. Confirm the `generate-instagram-carousel` step runs and completes.

- [ ] **Step 2: Verify carousel in DB**

```sql
SELECT metadata->>'slide_count', metadata->>'style_id', metadata->>'design_source', created_at
FROM job_outputs
WHERE job_id = '<new_job_id>'
  AND output_type = 'static_creative'
  AND platform = 'instagram_carousel'
ORDER BY created_at DESC LIMIT 1;
```

- [ ] **Step 3: Verify console logs for logo fetch**

Check Vercel function logs for:
- No `[carousel] logo data-URI is null` warning (logo fetch succeeded)
- No `[carousel] cover visual failed` warning (cover generation succeeded)
- No `[slideHtml] invalid composition` warnings (or if they appear, verify fallbacks were used correctly)

- [ ] **Step 4: Screenshot slides 1, 5, and last**

Using Playwright + fresh signed URLs, screenshot:
- Slide 1 (hook/cover): verify cover photo background + brand logo bottom-left
- A middle slide: verify beat-structured content (NOT social copy lifted verbatim), logo visible, no rotated/mangled text
- Last slide (CTA): verify readable CTA text, no vertical pill badge

- [ ] **Step 5: Verify Premium & Editorial style end-to-end**

Confirm the new job uses `style_id: 'premium_editorial'`. Check slides render the open generous-whitespace grid and Playfair Display font.

- [ ] **Step 6: Run full test suite**

```
npx vitest run
npx tsc --noEmit
```

Expected: all tests PASS, zero type errors.

- [ ] **Step 7: Run session-end.sh**

```
C:\Users\mjohn\Documents\LaunchBox.Media\session-end.sh
```

---

## Self-Review Checklist

### Spec coverage
- [x] Fix 1 — generateCarouselBeats: Tasks 1, 2, 3, 7, 8 (research feed, beat schema, cap at 12, field constraint)
- [x] Fix 2 — Logo compositing: Task 8 (logging + public URL fallback); cover visual: Task 6 + Task 8 (onFailure)
- [x] Fix 3 — GSAP animated: Tasks 3, 4, 7 (timelines on all slides, 3-second MP4 output, reuses Hyperframes contract)
- [x] Fix 4 — Quality gate: Task 5 (rotation/clipping/compression check)
- [x] Diagnostic: Task 10 (screenshot baseline), Task 11 (post-fix verification)
- [x] Premium & Editorial end-to-end: Task 11 Step 5

### No placeholders — all code is complete.

### Type consistency
- `CarouselBeat` defined in Task 1, used consistently in Tasks 2–8
- `buffer: Buffer` (not `png`) in `CarouselSlideResult` — used in Task 7 orchestrator and Task 8 upload
- `SlideBeat` extended with `'problem' | 'payoff'` in Task 1, used in beat ordering in Task 2
- `SLIDE_DURATION` exported from `slideHtml.ts` in Task 3, imported by `generateCarousel.ts` in Task 7 ✓
- `COMPOSITION_ID` exported from `slideHtml.ts`, no external usages needed ✓
- `checkSlide(png, beat: CarouselBeat)` signature in Task 5 — called with `CarouselBeat` in Task 7 ✓
- `resolveCoverVisual` signature adds `onFailure` in Task 6 — called with `onCoverVisualFailure` in Task 7 ✓
