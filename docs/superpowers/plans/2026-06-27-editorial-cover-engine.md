# Editorial Cover Engine (v1: Hero archetype) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the spike-proven layered editorial cover (`composeCover` Hero archetype) into the live carousel pipeline so `bold_personal` jobs render a real α-cutout subject composited behind/in-front of the headline, with deterministic fail-open to today's flat-image cover.

**Architecture:** Three new pure-ish units feed the existing renderer. `editorialPlan.planCover()` turns a cover beat + style into an `EditorialPlan` (archetype + token choreography + subject/background prompts). `assetProvider` fulfils those prompts via OpenAI `gpt-image-1` (`background:'transparent'` → real alpha) + `sharp` (alpha→bbox), returning `EditorialAssets`. `composeCover()` (already built) stacks semantic layers. `compileCarousel` calls them for the cover beat only when the style maps to Hero **and** a real cutout came back; otherwise it falls through to the current `buildFallbackSlide` cover. Body + CTA slides are untouched.

**Tech Stack:** TypeScript, Vitest (DI for unit tests, `RUN_LIVE=1` gate for render tests), OpenAI image API (`gpt-image-1`), `sharp`, the Hyperframes render service (`renderClient`), GSAP timeline contract.

**Guiding principles (enforced throughout):** (1) typography is the primary visual object, imagery amplifies it; (2) assets generate pixels only — the renderer owns composition. No `EditorialPlan` field that the renderer doesn't consume.

---

## What already exists (do NOT rebuild)

- `lib/carousel/composeCover.ts` — Hero renderer. Exports `composeCover`, `ComposeCoverInput`, `TypographyToken`, `TokenScale`, `SubjectAsset`, `EditorialAssetsLite`. Proven live.
- `lib/carousel/composeCover.test.ts` — 8 passing unit tests (z-order, clip band, choreography, degradation).
- `lib/carousel/assetProvider.live.test.ts` — proves `gpt-image-1` transparent → real alpha; `alphaBBox` scan; composites editorially. Lift its `alphaBBox` + OpenAI call into production code in Task 1.
- Live path: `content-generation.ts` Step 4 and `retry-carousel/route.ts` both call `compileCarousel` (`phaseOrchestrator.ts`) → `buildFallbackSlide`. That cover branch is the fall-through target; leave it working.

## Scope

**In:** `bold_personal` covers via the editorial path; fail-open to legacy; unit tests with DI; one live end-to-end verify.
**Out (deferred, named):** other cover archetypes (`type_dominant`, `magazine`, `collage`, `split`); `composeBody`; rubric `scoreCover`; precise face/eye-aware band; multi-variant generation; deleting the dead `generateCarousel`/`coverVisual`/`scoreVisual` engine (delete only after this ships and verifies in prod).

## File Structure

- Create `lib/carousel/assetProvider.ts` — image generation + alpha→bbox. One responsibility: produce `EditorialAssets` from prompts. Origin-agnostic (caller never learns it used native transparent gen).
- Create `lib/carousel/assetProvider.test.ts` — DI unit tests (no network; `sharp`-built fixtures).
- Create `lib/carousel/editorialPlan.ts` — `planCover()` + `headlineTokens()`. One responsibility: cover beat + style → `EditorialPlan | null`.
- Create `lib/carousel/editorialPlan.test.ts` — pure unit tests.
- Modify `lib/carousel/composeCover.ts` — rename exported `EditorialAssetsLite` → `EditorialAssets` (shared name; no behaviour change).
- Modify `lib/carousel/phaseOrchestrator.ts` — `compileCarousel` cover branch: plan → assets → compose, fail-open; thread `audience`/`handle`. Body/CTA untouched.
- Modify `lib/carousel/phaseOrchestrator.ts` callers' inputs only where needed (`CompileCarouselInput` gains `audience?`, `handle?`).
- Create `lib/carousel/editorialCover.live.test.ts` — `RUN_LIVE` integrated cover verify.

---

### Task 1: AssetProvider — transparent subject + background, alpha→bbox

**Files:**
- Modify: `lib/carousel/composeCover.ts` (rename `EditorialAssetsLite` → `EditorialAssets`)
- Create: `lib/carousel/assetProvider.ts`
- Test: `lib/carousel/assetProvider.test.ts`

- [ ] **Step 1: Rename the shared assets type in composeCover.ts**

In `lib/carousel/composeCover.ts`, rename the type and its single use. Find:

```ts
export type EditorialAssetsLite = {
  background: string | null
  subject: SubjectAsset | null
  accents?: string[]
}
```

Replace with:

```ts
export type EditorialAssets = {
  background: string | null
  subject: SubjectAsset | null
  accents?: string[]
}
```

Then in the same file change the `ComposeCoverInput` field type:

```ts
export type ComposeCoverInput = {
  resolved: ResolvedDesignSystem
  headline: TypographyToken[]
  assets: EditorialAssets
  overlapBand?: { topPct: number; bottomPct: number }
  handle?: string
}
```

- [ ] **Step 2: Verify nothing else referenced the old name**

Run: `grep -rn "EditorialAssetsLite" lib/`
Expected: no matches.

- [ ] **Step 3: Write the failing test for the AssetProvider**

Create `lib/carousel/assetProvider.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { generateSubject, generateBackground, alphaBBox, type AssetProviderDeps } from './assetProvider'

// Build an RGBA PNG: fully transparent canvas with one opaque red rectangle.
async function cutoutPng(W: number, H: number, rx: number, ry: number, rw: number, rh: number): Promise<Buffer> {
  const rect = await sharp({ create: { width: rw, height: rh, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer()
  return sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: rect, left: rx, top: ry }])
    .png().toBuffer()
}

const depsReturning = (png: Buffer | null): AssetProviderDeps => ({ generateImage: async () => png })

describe('assetProvider.alphaBBox', () => {
  it('finds the opaque content bounding box', async () => {
    const png = await cutoutPng(200, 400, 40, 80, 100, 240)
    const info = await alphaBBox(png)
    expect(info.width).toBe(200)
    expect(info.height).toBe(400)
    expect(info.bbox.x).toBeGreaterThanOrEqual(38)
    expect(info.bbox.x).toBeLessThanOrEqual(42)
    expect(info.bbox.w).toBeGreaterThanOrEqual(96)
    expect(info.coverage).toBeGreaterThan(0.2)
    expect(info.coverage).toBeLessThan(0.4)
  })
})

describe('assetProvider.generateSubject', () => {
  it('returns a SubjectAsset with frame-scaled bbox for a real cutout', async () => {
    const png = await cutoutPng(1024, 1536, 200, 100, 600, 1300)
    const subject = await generateSubject('prompt', depsReturning(png))
    expect(subject).not.toBeNull()
    expect(subject!.hasAlpha).toBe(true)
    expect(subject!.dataUri.startsWith('data:image/png;base64,')).toBe(true)
    // bbox scaled from 1536-tall source into the 1350 frame
    expect(subject!.bbox.h).toBeGreaterThan(900)
    expect(subject!.bbox.h).toBeLessThan(1350)
  })

  it('returns null when the model output has no real transparency (coverage ~1)', async () => {
    const opaque = await sharp({ create: { width: 1024, height: 1536, channels: 4, background: { r: 10, g: 10, b: 10, alpha: 1 } } }).png().toBuffer()
    expect(await generateSubject('prompt', depsReturning(opaque))).toBeNull()
  })

  it('returns null when generation yields no image', async () => {
    expect(await generateSubject('prompt', depsReturning(null))).toBeNull()
  })

  it('returns null (fail-open) when generation throws', async () => {
    const deps: AssetProviderDeps = { generateImage: async () => { throw new Error('429 rate limit') } }
    expect(await generateSubject('prompt', deps)).toBeNull()
  })
})

describe('assetProvider.generateBackground', () => {
  it('returns a data-URI on success', async () => {
    const png = await sharp({ create: { width: 1024, height: 1536, channels: 3, background: { r: 20, g: 20, b: 28 } } }).png().toBuffer()
    const bg = await generateBackground('prompt', depsReturning(png))
    expect(bg!.startsWith('data:image/png;base64,')).toBe(true)
  })

  it('returns null (fail-open) on throw', async () => {
    const deps: AssetProviderDeps = { generateImage: async () => { throw new Error('boom') } }
    expect(await generateBackground('prompt', deps)).toBeNull()
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run lib/carousel/assetProvider.test.ts`
Expected: FAIL — `Failed to load url ./assetProvider` (module missing).

- [ ] **Step 5: Implement the AssetProvider**

Create `lib/carousel/assetProvider.ts`:

```ts
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
    const scale = FRAME_HEIGHT / info.height
    const bbox = {
      x: Math.round(info.bbox.x * scale),
      y: Math.round(info.bbox.y * scale),
      w: Math.round(info.bbox.w * scale),
      h: Math.round(info.bbox.h * scale),
    }
    return { dataUri: `data:image/png;base64,${png.toString('base64')}`, hasAlpha: true, bbox }
  } catch (e) {
    console.warn('[assetProvider] subject generation failed:', e instanceof Error ? e.message : e)
    return null
  }
}

export async function generateBackground(prompt: string, deps: AssetProviderDeps = defaultDeps): Promise<string | null> {
  try {
    const png = await deps.generateImage({ prompt, transparent: false })
    return png ? `data:image/png;base64,${png.toString('base64')}` : null
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
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run lib/carousel/assetProvider.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 8: Commit**

```bash
git add lib/carousel/assetProvider.ts lib/carousel/assetProvider.test.ts lib/carousel/composeCover.ts
git commit -m "feat(carousel): AssetProvider — transparent subject + alpha bbox

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: EditorialPlan — planCover (archetype routing + token choreography + asset prompts)

**Files:**
- Create: `lib/carousel/editorialPlan.ts`
- Test: `lib/carousel/editorialPlan.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/carousel/editorialPlan.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { planCover, headlineTokens } from './editorialPlan'
import type { CarouselBeat } from './types'
import type { ResolvedDesignSystem } from '@/lib/designSystem/resolveDesignSystem'

const resolved = (style_id: ResolvedDesignSystem['style_id']): ResolvedDesignSystem => ({
  style_id, source: 'profile_default', primary_color: '#FFFFFF', accent: '#FF3B30',
  background: '#0B0B0F', split_image_cover: false,
})
const cover = (over: Partial<CarouselBeat> = {}): CarouselBeat => ({
  beat: 'hook', isCover: true, index: 0, title: 'Stop Creating Carousels', highlightWord: 'Carousels', ...over,
})
const ctx = { topic: 'why your carousels flop', audience: 'creators', handle: 'ravendesigns' }

describe('headlineTokens', () => {
  it('emits one xl token per word and paints the highlight word accent', () => {
    const toks = headlineTokens('Stop Creating Carousels', 'Carousels')
    expect(toks.map(t => t.text)).toEqual(['Stop', 'Creating', 'Carousels'])
    expect(toks.every(t => t.scale === 'xl')).toBe(true)
    expect(toks[0].break).toBe(true)
    expect(toks[2].break).toBeFalsy()
    expect(toks[2].color).toBe('accent')
    expect(toks[0].color).toBe('fg')
  })

  it('matches the highlight word ignoring case and punctuation', () => {
    const toks = headlineTokens('THE COLD OPEN', 'cold')
    expect(toks.find(t => t.text === 'COLD')!.color).toBe('accent')
  })
})

describe('planCover', () => {
  it('returns a Hero plan for bold_personal covers', () => {
    const plan = planCover(cover(), resolved('bold_personal'), ctx)
    expect(plan).not.toBeNull()
    expect(plan!.archetype).toBe('hero')
    expect(plan!.headline.map(t => t.text)).toEqual(['Stop', 'Creating', 'Carousels'])
    expect(plan!.handle).toBe('ravendesigns')
    // subject prompt is text-free, transparent, topic-aware
    expect(plan!.subjectPrompt).toMatch(/transparent background/i)
    expect(plan!.subjectPrompt).toMatch(/no text/i)
    expect(plan!.subjectPrompt).toContain('why your carousels flop')
    expect(plan!.bgPrompt).toMatch(/no people|text-free/i)
  })

  it('returns null for styles not yet migrated to an archetype (v1)', () => {
    expect(planCover(cover(), resolved('premium_editorial'), ctx)).toBeNull()
    expect(planCover(cover(), resolved('clean_direct'), ctx)).toBeNull()
  })

  it('returns null for non-cover beats', () => {
    expect(planCover(cover({ isCover: false, beat: 'value', index: 2 }), resolved('bold_personal'), ctx)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/carousel/editorialPlan.test.ts`
Expected: FAIL — module `./editorialPlan` missing.

- [ ] **Step 3: Implement editorialPlan.ts**

Create `lib/carousel/editorialPlan.ts`:

```ts
// EditorialPlan — the creative brief for a cover. Deterministic: a cover beat +
// resolved style → archetype + headline choreography + the asset prompts the
// AssetProvider must fulfil. Named EditorialPlan (not CoverPlan) so body slides
// can share it later. RULE: every field here is consumed by composeCover or the
// AssetProvider — no dead direction.
//
// v1 implements the Hero archetype only and routes ONLY the styles whose
// benchmark cover is a type+cutout-subject Hero. Other styles return null →
// caller keeps the legacy flat-image cover until their archetype ships.
import { STYLE_LIBRARY } from '@/lib/designSystem/styleLibrary'
import type { ResolvedDesignSystem } from '@/lib/designSystem/resolveDesignSystem'
import type { CarouselBeat } from './types'
import type { TypographyToken } from './composeCover'

export type CoverArchetype = 'hero' // type_dominant | magazine | collage | split — deferred

export type EditorialPlan = {
  archetype: CoverArchetype
  headline: TypographyToken[]
  subjectPrompt: string
  bgPrompt: string
  overlapBand?: { topPct: number; bottomPct: number }
  handle?: string
}

// Styles whose benchmark cover is a Hero (type + cutout subject). Grow this set
// as archetypes ship; keep it the single source of routing truth.
const HERO_STYLES = new Set<ResolvedDesignSystem['style_id']>(['bold_personal'])

const PERSONAL_RE = /\b(personal|fitness|wellness|weight|transformation|consumer|self|body|health|motivation|confidence|diet|mindset)\b/i

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/gi, '')

// Title → tokens: one xl word per line (Hero rhythm), highlight word painted
// accent. Tier-1 choreography only (no fit-driven condensation / optical
// balancing — those are deferred Tier-2 fields).
export function headlineTokens(title: string, highlightWord?: string): TypographyToken[] {
  const words = title.trim().split(/\s+/).filter(Boolean)
  const hw = highlightWord ? norm(highlightWord) : ''
  return words.map((w, i) => ({
    text: w,
    scale: 'xl' as const,
    color: hw && norm(w) === hw ? ('accent' as const) : ('fg' as const),
    break: i < words.length - 1,
  }))
}

export function planCover(
  beat: CarouselBeat,
  resolved: ResolvedDesignSystem,
  ctx: { topic: string; audience?: string | null; handle?: string }
): EditorialPlan | null {
  if (!beat.isCover) return null
  if (!HERO_STYLES.has(resolved.style_id)) return null
  const style = STYLE_LIBRARY[resolved.style_id]
  const personal = PERSONAL_RE.test(ctx.audience || '')

  const subjectPrompt = [
    `Full-body studio photograph of a single person for a social media cover about "${ctx.topic}".`,
    personal
      ? 'Relatable everyday person, direct eye contact, genuine emotional expression.'
      : 'Confident expert, direct eye contact.',
    `Pose/gesture in the spirit of: ${style.hook_technique}.`,
    'Isolated subject only, completely transparent background, no text, no words, no logos, sharp clean cut-out edges, cinematic rim lighting, centered, head to knees visible.',
  ].join(' ')

  const bgPrompt = [
    `Moody atmospheric editorial backdrop for a cover about "${ctx.topic}".`,
    'Abstract, text-free, no people, no objects, cinematic, soft vignette, dark tones with a subtle warm rim glow, portrait orientation.',
  ].join(' ')

  return {
    archetype: 'hero',
    headline: headlineTokens(beat.title, beat.highlightWord),
    subjectPrompt,
    bgPrompt,
    handle: ctx.handle,
    // overlapBand left undefined → composeCover.defaultBand derives the lower
    // slice from the subject bbox.
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/carousel/editorialPlan.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Type-check + commit**

Run: `npx tsc --noEmit` (expect clean), then:

```bash
git add lib/carousel/editorialPlan.ts lib/carousel/editorialPlan.test.ts
git commit -m "feat(carousel): EditorialPlan.planCover — Hero archetype routing + token choreography

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Wire the editorial cover into compileCarousel (fail-open)

**Files:**
- Modify: `lib/carousel/phaseOrchestrator.ts` (the `compileCarousel` function + `CompileCarouselInput`)
- Test: `lib/carousel/editorialCover.test.ts` (new — DI integration test for the cover branch)

**Context:** `compileCarousel` today separates `ctaBeat` from `bodyBeats` (which includes the cover/hook beat at index 0), generates `runVisualBatch` (cover image + body texture), then `bodyHtml = bodyBeats.map(buildFallbackSlide)` with `__COVER_VISUAL__` injected on `i===0`. We add an editorial override for the cover beat: build a `planCover`; if it returns a Hero plan, fulfil assets and `composeCover`; only use it when a real `subject` came back; else fall through to the existing `buildFallbackSlide` cover untouched.

- [ ] **Step 1: Write the failing DI integration test**

Create `lib/carousel/editorialCover.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { compileCarousel } from './phaseOrchestrator'
import type { CarouselBeat } from './types'
import type { ResolvedDesignSystem } from '@/lib/designSystem/resolveDesignSystem'
import type { EditorialAssets } from './composeCover'

const RESOLVED: ResolvedDesignSystem = {
  style_id: 'bold_personal', source: 'profile_default', primary_color: '#FFFFFF',
  accent: '#FF3B30', background: '#0B0B0F', split_image_cover: false,
}
const beats: CarouselBeat[] = [
  { beat: 'hook', isCover: true, index: 0, title: 'Stop Creating Carousels', highlightWord: 'Carousels' },
  { beat: 'value', isCover: false, index: 1, title: 'Do This Instead', bullets: ['one', 'two'] },
  { beat: 'cta', isCover: false, index: 2, title: 'Get The Kit', automationKeyword: 'KIT' },
]

const fakeSubjectUri = 'data:image/png;base64,FAKE'
const assetsWithSubject: EditorialAssets = {
  background: 'data:image/png;base64,BG',
  subject: { dataUri: fakeSubjectUri, hasAlpha: true, bbox: { x: 100, y: 120, w: 700, h: 1200 } },
}
const assetsNoSubject: EditorialAssets = { background: 'data:image/png;base64,BG', subject: null }

// Stub the slow bits: visual batch (body texture) + the editorial asset provider.
const baseDeps = {
  runVisualBatch: async () => ({ coverUrl: 'http://x/cover.png', bodyTextureUrl: 'http://x/tex.png' }),
  fetchDataUri: async () => 'data:image/png;base64,LEGACY',
}

describe('compileCarousel editorial cover branch', () => {
  it('uses the layered editorial cover when a Hero plan + real subject are available', async () => {
    const res = await compileCarousel(
      { beats, resolved: RESOLVED, topic: 'carousels', audience: 'creators', handle: 'ravendesigns' },
      { ...baseDeps, provideEditorialAssets: async () => assetsWithSubject }
    )
    // slide 0 is the composeCover output: layered, carries the subject + back/front type layers
    expect(res.slideHtml[0]).toContain('id="layer-subject"')
    expect(res.slideHtml[0]).toContain('id="type-back"')
    expect(res.slideHtml[0]).toContain(fakeSubjectUri)
    // it is NOT the legacy grid cover
    expect(res.slideHtml[0]).not.toContain('__COVER_VISUAL__')
  })

  it('falls back to the legacy buildFallbackSlide cover when no real subject comes back', async () => {
    const res = await compileCarousel(
      { beats, resolved: RESOLVED, topic: 'carousels', audience: 'creators', handle: 'ravendesigns' },
      { ...baseDeps, provideEditorialAssets: async () => assetsNoSubject }
    )
    expect(res.slideHtml[0]).not.toContain('id="layer-subject"')
    expect(res.slideHtml[0]).toContain('id="slide"') // a valid slide still rendered
  })

  it('falls back to legacy for styles without a Hero archetype', async () => {
    const res = await compileCarousel(
      { beats, resolved: { ...RESOLVED, style_id: 'premium_editorial' }, topic: 'carousels', audience: 'creators', handle: 'ravendesigns' },
      { ...baseDeps, provideEditorialAssets: async () => assetsWithSubject } // should be ignored
    )
    expect(res.slideHtml[0]).not.toContain('id="layer-subject"')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/carousel/editorialCover.test.ts`
Expected: FAIL — `compileCarousel` does not accept a second `deps` arg / `audience`/`handle` not on input; no editorial branch.

- [ ] **Step 3: Add an injectable deps seam + input fields to compileCarousel**

In `lib/carousel/phaseOrchestrator.ts`, add imports at the top with the other carousel imports:

```ts
import { planCover } from './editorialPlan'
import { provideEditorialAssets as defaultProvideEditorialAssets } from './assetProvider'
import { composeCover } from './composeCover'
```

Extend `CompileCarouselInput` (add the two optional fields; leave the rest):

```ts
export type CompileCarouselInput = {
  beats: CarouselBeat[]
  resolved: ResolvedDesignSystem
  topic: string
  audience?: string | null          // NEW — feeds the subject prompt
  handle?: string | null            // NEW — handle pill on the editorial cover
  selectedAssetUrl?: string | null
  logoDataUri?: string | null
  proofAssets?: Record<number, string>
  proofAssetUrl?: string | null
  onCoverVisualFailure?: (reason: string) => void
}
```

Add an injectable deps type just above the `compileCarousel` function:

```ts
// Injectable seams so the cover branch is unit-testable without network/image gen.
export type CompileCarouselDeps = {
  provideEditorialAssets: typeof defaultProvideEditorialAssets
}
const defaultCompileDeps: CompileCarouselDeps = {
  provideEditorialAssets: defaultProvideEditorialAssets,
}
```

- [ ] **Step 4: Implement the editorial cover branch in compileCarousel**

Change the `compileCarousel` signature to accept deps:

```ts
export async function compileCarousel(
  input: CompileCarouselInput,
  deps: CompileCarouselDeps = defaultCompileDeps
): Promise<CompileCarouselResult> {
```

Immediately after `const { beats, resolved, topic, selectedAssetUrl, logoDataUri, proofAssets, proofAssetUrl, onCoverVisualFailure } = input` (update the destructure to also pull `audience` and `handle`):

```ts
  const { beats, resolved, topic, audience, handle, selectedAssetUrl, logoDataUri, proofAssets, proofAssetUrl, onCoverVisualFailure } = input
```

Then, after the existing visual-batch + proof step (the block that produces `coverDataUri`, `textureDataUri`, `ctaBeat`, `bodyBeats`) and **before** the `const bodyHtml = bodyBeats.map(...)` line, insert the editorial-cover computation:

```ts
  // ── Editorial cover (Hero archetype) ────────────────────────────────────
  // Plan is deterministic + free. Only spend on assets when a Hero plan exists.
  // Use the layered cover only if a real α-cutout subject came back; otherwise
  // fall through to the legacy buildFallbackSlide cover below (fail-open).
  let editorialCoverHtml: string | null = null
  const coverBeat = bodyBeats.find(b => b.isCover)
  if (coverBeat) {
    const plan = planCover(coverBeat, resolved, { topic, audience, handle: handle ?? undefined })
    if (plan) {
      try {
        const assets = await deps.provideEditorialAssets({ subjectPrompt: plan.subjectPrompt, bgPrompt: plan.bgPrompt })
        if (assets.subject) {
          let html = composeCover({ resolved, headline: plan.headline, assets, overlapBand: plan.overlapBand, handle: plan.handle })
          if (logoDataUri) html = stampLogo(html, logoDataUri)
          editorialCoverHtml = html
        } else {
          onCoverVisualFailure?.('editorial subject cutout unavailable — using legacy cover')
        }
      } catch (e) {
        onCoverVisualFailure?.(`editorial cover failed: ${e instanceof Error ? e.message : e}`)
      }
    }
  }
```

Then change the body-HTML map so the cover slot uses the editorial cover when present. Replace the existing cover-injection line inside the `bodyBeats.map`:

```ts
  const bodyHtml = bodyBeats.map((beat, i) => {
    if (i === 0 && editorialCoverHtml) return editorialCoverHtml
    let html = buildFallbackSlide(beat, resolved, {
      bodyTextureUri: i > 0 && textureDataUri ? textureDataUri : undefined,
    })
    if (i === 0 && coverDataUri) {
      html = html.replaceAll('__COVER_VISUAL__', coverDataUri)
    }
    if (logoDataUri) html = stampLogo(html, logoDataUri)
    return html
  })
```

> Note (ponytail): when the editorial path wins we still generated `runVisualBatch`'s legacy cover image (≈$0.04 wasted). Acceptable for v1. If cost matters, split `runVisualBatch` into texture-only + legacy-cover and skip the legacy cover when a Hero plan exists. `// ponytail: legacy cover gen wasted on hero path; split runVisualBatch if cost matters`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/carousel/editorialCover.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Run the full carousel suite (no regressions) + type-check**

Run: `npx vitest run lib/carousel`
Expected: all pass, live tests skipped.
Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Thread audience + handle from the two live callers**

In `lib/workflows/content-generation.ts`, find the `compileCarousel({ ... })` call (~line 870) and add the two fields (the surrounding code already has `job` and `handle`/profile in scope — use `job.target_audience` and the instagram handle variable used elsewhere in this block):

```ts
        const { slideHtml, ctaMeta } = await compileCarousel({
          beats,
          resolved: resolvedDesign,
          topic: job.topic,
          audience: job.target_audience,
          handle: profile?.instagram_handle ?? null,
          selectedAssetUrl,
          logoDataUri,
          proofAssetUrl: job.proof_asset_url ?? null,
          onCoverVisualFailure: async (reason) => { /* unchanged existing body */ },
        })
```

In `app/api/jobs/[jobId]/retry-carousel/route.ts`, find the `compileCarousel({ ... })` call (~line 108) and add:

```ts
      const { slideHtml, ctaMeta } = await compileCarousel({
        beats, resolved: resolvedDesign, topic: job.topic,
        audience: job.target_audience, handle: profile?.instagram_handle ?? null,
        selectedAssetUrl, logoDataUri, proofAssetUrl: job.proof_asset_url ?? null,
        onCoverVisualFailure: async (reason) => { /* unchanged existing body */ },
      })
```

- [ ] **Step 8: Type-check + commit**

Run: `npx tsc --noEmit` (expect clean), then:

```bash
git add lib/carousel/phaseOrchestrator.ts lib/carousel/editorialCover.test.ts lib/workflows/content-generation.ts "app/api/jobs/[jobId]/retry-carousel/route.ts"
git commit -m "feat(carousel): wire editorial Hero cover into compileCarousel (fail-open)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Live end-to-end verification

**Files:**
- Create: `lib/carousel/editorialCover.live.test.ts`

- [ ] **Step 1: Write the live verify test**

Create `lib/carousel/editorialCover.live.test.ts`:

```ts
// LIVE end-to-end: real planCover → real AssetProvider (gpt-image-1) → composeCover
// for a bold_personal cover, rendered through Hyperframes. Writes a still to
// tmp/cover-verify/ for visual inspection.
//   RUN_LIVE=1 npx vitest run lib/carousel/editorialCover.live.test.ts
import { describe, it, expect } from 'vitest'
import { config as loadEnv } from 'dotenv'
import { resolve } from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { planCover } from './editorialPlan'
import { provideEditorialAssets } from './assetProvider'
import { composeCover } from './composeCover'
import { injectStaticVisibility } from './slideHtml'
import { renderStaticPng } from './renderClient'
import type { CarouselBeat } from './types'
import type { ResolvedDesignSystem } from '@/lib/designSystem/resolveDesignSystem'

loadEnv({ path: resolve(process.cwd(), '.env.local') })
const LIVE = process.env.RUN_LIVE === '1'

const RESOLVED: ResolvedDesignSystem = {
  style_id: 'bold_personal', source: 'profile_default', primary_color: '#FFFFFF',
  accent: '#FF3B30', background: '#0B0B0F', split_image_cover: false,
}
const COVER: CarouselBeat = { beat: 'hook', isCover: true, index: 0, title: 'Stop Creating Carousels', highlightWord: 'Carousels' }

describe.skipIf(!LIVE)('editorial cover end-to-end (LIVE)', () => {
  it('plans → generates assets → composes → renders a bold_personal cover', async () => {
    const plan = planCover(COVER, RESOLVED, { topic: 'why your carousels flop', audience: 'creators', handle: 'ravendesigns' })
    expect(plan).not.toBeNull()
    const assets = await provideEditorialAssets({ subjectPrompt: plan!.subjectPrompt, bgPrompt: plan!.bgPrompt })
    expect(assets.subject).not.toBeNull()
    const html = composeCover({ resolved: RESOLVED, headline: plan!.headline, assets, overlapBand: plan!.overlapBand, handle: plan!.handle })
    const png = await renderStaticPng(injectStaticVisibility(html))
    const dir = resolve(process.cwd(), 'tmp', 'cover-verify')
    mkdirSync(dir, { recursive: true })
    writeFileSync(resolve(dir, 'hero-e2e.png'), png)
    console.log('WROTE hero-e2e.png', png.length, 'bytes')
    expect(png.length).toBeGreaterThan(5000)
  }, 300_000)
})
```

- [ ] **Step 2: Run the live verify**

Run: `RUN_LIVE=1 npx vitest run lib/carousel/editorialCover.live.test.ts`
Expected: PASS; `tmp/cover-verify/hero-e2e.png` written.

- [ ] **Step 3: Visually inspect the still**

Open `tmp/cover-verify/hero-e2e.png`. Confirm: real subject cutout, headline reads with intentional occlusion (type behind subject), accent word in `#FF3B30`, handle pill + swipe cue. If headline/subject collide badly, note for a follow-on placement task — do NOT expand scope here.

- [ ] **Step 4: Commit**

```bash
git add lib/carousel/editorialCover.live.test.ts
git commit -m "test(carousel): live end-to-end editorial cover verify

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Deferred (explicit — do NOT build in this plan)

- **Other cover archetypes**: `type_dominant` (clean_direct), `magazine`/`collage` (premium_editorial), `split` (warm_handmade). Each is a follow-on plan adding a `compose*` path + extending `HERO_STYLES`/archetype routing.
- **composeBody**: body slides stay on `buildFallbackSlide`. `EditorialPlan` is named to share later.
- **scoreCover**: rubric evaluation of the composed cover vs benchmark. Only worth it once ≥2 archetypes exist.
- **Precise band**: face/eye-aware overlap. Coarse bbox + `overlapBand` ships now.
- **Delete dead engine**: remove `generateCarousel.ts`, `coverVisual.ts`, `scoreVisual.pickBestVisual`, `generateSlideHtml` only AFTER this is verified in production. Keep `sniffMediaType`.
- **Cost optimization**: split `runVisualBatch` to skip the legacy cover gen on the Hero path.

## Self-Review

**Spec coverage:** AssetProvider (native transparent + fail-open) → Task 1 ✓. EditorialPlan / Style-Director asset prompts / token choreography → Task 2 ✓. Renderer owns composition (composeCover already built; consumed in Task 3) ✓. Fail-open to legacy + parallelism preserved (image gen awaited as before; body sync) → Task 3 ✓. Live proof → Task 4 ✓. First principles honoured: every `EditorialPlan` field (archetype, headline, subjectPrompt, bgPrompt, overlapBand, handle) is consumed by composeCover or the provider — no dead direction.

**Placeholder scan:** none — every code step is complete; the two live-caller edits reference exact call sites and reuse existing in-scope variables.

**Type consistency:** `EditorialAssets` defined in composeCover (Task 1), imported by assetProvider (Task 1) and used by the test/compile branch (Task 3). `SubjectAsset`, `TypographyToken`, `ComposeCoverInput` are the existing composeCover exports. `provideEditorialAssets(req: { subjectPrompt; bgPrompt })` signature matches its call in Task 3 and the live test in Task 4. `planCover(beat, resolved, ctx)` signature matches Tasks 2/3/4. `CompileCarouselDeps.provideEditorialAssets` is `typeof defaultProvideEditorialAssets`, matching the stub in the Task 3 test.
