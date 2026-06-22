# Carousel Design System — Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the design-system capture + resolution layer — style library, schema, profile/job UI, a pure read-only resolver, and color extraction/derivation — with no rendering.

**Architecture:** A self-contained `lib/designSystem/` module of small pure units (style data, palette derivation, read-only resolver, jobs-only writer, color extraction) plus one additive migration, one server route, and profile/job UI. The resolver performs zero DB writes; inferred styles are job-scoped and never persisted to the profile.

**Tech Stack:** Next.js 16 / React 19 (CommonJS, `@/*`→`./*`, moduleResolution bundler), Supabase, Anthropic Haiku, `culori` (palette math), `node-vibrant` (color extraction), `vitest` + `vite-tsconfig-paths` (new test harness).

**Spec:** `docs/superpowers/specs/2026-06-22-carousel-design-system-phase-a.md`

**Testing convention:** TDD with vitest for the pure lib units (Tasks 2–6). UI components, the API route, and the migration (Tasks 7–11) have no unit-test culture in this repo and are CSS/integration-shaped; verify those with `npx tsc --noEmit` + the explicit manual checks given. Run `npx tsc --noEmit` at the end of every task regardless.

---

## File Structure

```
lib/designSystem/
  styleLibrary.ts          # Task 2 — types (StyleId, Palette, StyleDescriptor), STYLE_LIBRARY, STYLE_LIST
  styleLibrary.test.ts     # Task 2
  colorDerivation.ts       # Task 3 — derivePalette(styleId, primary) -> Palette (culori)
  colorDerivation.test.ts  # Task 3
  resolveDesignSystem.ts   # Task 4 — resolveDesignSystem (read-only) + classifyStyle (Haiku, injectable)
  resolveDesignSystem.test.ts # Task 4
  persistJobStyle.ts       # Task 5 — ONLY writer; jobs table ONLY
  persistJobStyle.test.ts  # Task 5
  extractColor.ts          # Task 6 — extractDominantColor(Buffer) -> hex (node-vibrant)
  extractColor.test.ts     # Task 6
app/api/design-system/extract-color/route.ts   # Task 7
supabase/migrations/<timestamp>_design_system.sql  # Task 8
components/StylePicker.tsx  # Task 9
app/profile/page.tsx        # Task 10 (modify)
app/api/jobs/route.ts       # Task 11 (modify)
app/jobs/new/page.tsx       # Task 11 (modify — exact path verified in task)
vitest.config.ts            # Task 1
```

---

## Task 1: Test harness (vitest)

**Files:**
- Create: `vitest.config.ts`
- Create: `lib/designSystem/_smoke.test.ts` (deleted at end of task)
- Modify: `package.json` (scripts + devDeps)

- [ ] **Step 1: Install dev dependencies**

```bash
npm install -D vitest@^2 vite-tsconfig-paths@^5
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
})
```

- [ ] **Step 3: Add test script to `package.json`**

In the `"scripts"` block, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write a smoke test**

Create `lib/designSystem/_smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('vitest harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 5: Run it — verify the harness works**

Run: `npm test`
Expected: PASS, 1 test passed.

- [ ] **Step 6: Delete the smoke test**

```bash
rm lib/designSystem/_smoke.test.ts
```

- [ ] **Step 7: Typecheck + commit**

```bash
npx tsc --noEmit
git add package.json package-lock.json vitest.config.ts
git commit -m "test: add vitest harness with tsconfig path resolution"
```

---

## Task 2: Style library

**Files:**
- Create: `lib/designSystem/styleLibrary.ts`
- Test: `lib/designSystem/styleLibrary.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/designSystem/styleLibrary.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { STYLE_LIBRARY, STYLE_LIST, type StyleId } from './styleLibrary'

const IDS: StyleId[] = ['bold_personal', 'clean_direct', 'warm_handmade', 'sharp_professional', 'premium_editorial']
const HEX = /^#[0-9a-fA-F]{6}$/

describe('STYLE_LIBRARY', () => {
  it('has exactly the 5 styles, ordered, in both shapes', () => {
    expect(STYLE_LIST.map(s => s.id)).toEqual(IDS)
    expect(Object.keys(STYLE_LIBRARY).sort()).toEqual([...IDS].sort())
  })

  it('every descriptor has all required fields populated', () => {
    for (const s of STYLE_LIST) {
      expect(s.display_name.length).toBeGreaterThan(0)
      expect(s.description.length).toBeGreaterThan(0)
      expect(s.preview_image_url.length).toBeGreaterThan(0)
      expect(s.typography.display_font.length).toBeGreaterThan(0)
      expect(s.typography.body_font.length).toBeGreaterThan(0)
      expect(s.typography.treatment.length).toBeGreaterThan(0)
      expect(s.layout_descriptor.length).toBeGreaterThan(0)
      expect(s.hook_technique.length).toBeGreaterThan(0)
    }
  })

  it('implied_tone matches the locked palettes', () => {
    for (const s of STYLE_LIST) {
      expect(s.implied_tone.primary).toMatch(HEX)
      expect(s.implied_tone.accent).toMatch(HEX)
      expect(s.implied_tone.background).toMatch(HEX)
    }
    expect(STYLE_LIBRARY.bold_personal.implied_tone).toEqual({ background: '#0B0B0F', primary: '#FFFFFF', accent: '#FF3B30' })
    expect(STYLE_LIBRARY.clean_direct.implied_tone).toEqual({ background: '#FFFFFF', primary: '#111827', accent: '#2563EB' })
    expect(STYLE_LIBRARY.warm_handmade.implied_tone).toEqual({ background: '#F4ECDD', primary: '#4A3728', accent: '#E08A3C' })
    expect(STYLE_LIBRARY.sharp_professional.implied_tone).toEqual({ background: '#0F172A', primary: '#F8FAFC', accent: '#38BDF8' })
    expect(STYLE_LIBRARY.premium_editorial.implied_tone).toEqual({ background: '#F7F5F1', primary: '#141414', accent: '#7A5C3E' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- styleLibrary`
Expected: FAIL — cannot find module `./styleLibrary`.

- [ ] **Step 3: Write the implementation**

Create `lib/designSystem/styleLibrary.ts`:

```ts
// Carousel design-system style library. 5 named styles, each a complete design
// system (typography pairing + layout grid + signature hook technique).
//
// Colors are deliberately NOT baked into the descriptors — color comes from the
// customer (or is derived). The ONLY baked colors are `implied_tone`, the
// fallback palette used when job + profile + logo all yield no color. Locked
// 2026-06-22 with sign-off; each carries a rationale comment.

export type StyleId =
  | 'bold_personal'
  | 'clean_direct'
  | 'warm_handmade'
  | 'sharp_professional'
  | 'premium_editorial'

export type Palette = { primary: string; accent: string; background: string }

export type StyleDescriptor = {
  id: StyleId
  display_name: string
  description: string
  preview_image_url: string
  typography: {
    display_font: string // contract name; the font FILE is bundled in Phase B
    body_font: string
    treatment: string
  }
  layout_descriptor: string
  hook_technique: string
  implied_tone: Palette
}

export const STYLE_LIBRARY: Record<StyleId, StyleDescriptor> = {
  bold_personal: {
    id: 'bold_personal',
    display_name: 'Bold & Personal',
    description: 'Huge type and a real person looking right at your reader.',
    preview_image_url: '/style-previews/bold_personal.png',
    typography: {
      display_font: 'Anton',
      body_font: 'Inter',
      treatment: 'Extreme-weight ultra-bold geometric sans display, all caps, massive tracking, tight leading, locked into a solid block. No body copy on the cover.',
    },
    layout_descriptor: 'Top-center handle pill. Headline in the upper 45%. Large masked human/character cutout breaking the lower frame boundary in the bottom 55%. Directional swipe badge floating mid-right. Page dots at bottom center.',
    hook_technique: 'High-contrast typographic scale paired with a realistic human cutout executing a direct physical gesture (e.g. a stopping hand) aimed at the reader.',
    // near-black canvas, white type, one hot stop-sign accent
    implied_tone: { background: '#0B0B0F', primary: '#FFFFFF', accent: '#FF3B30' },
  },
  clean_direct: {
    id: 'clean_direct',
    display_name: 'Clean & Direct',
    description: 'Crisp, no-nonsense comparisons and one clear focal point.',
    preview_image_url: '/style-previews/clean_direct.png',
    typography: {
      display_font: 'Montserrat',
      body_font: 'Inter',
      treatment: 'Medium-weight geometric sans subheadline inside a thin outlined container; clean sentence-case body with heavy bolding on key phrases; or heavy display sans + light geometric body for single-asset variants.',
    },
    layout_descriptor: 'Top-center handle, pill-enclosed title, then either (a) two-column side-by-side comparison mockups with floating cross/check badges, or (b) a single centered asset dead-center with type framing it above/below and wide clean margins.',
    hook_technique: 'Side-by-side A/B comparison with explicit right/wrong iconography, OR a singular centered focal asset with directional pointer graphics driving attention to one point.',
    // bright canvas, ink text, single trustworthy blue
    implied_tone: { background: '#FFFFFF', primary: '#111827', accent: '#2563EB' },
  },
  warm_handmade: {
    id: 'warm_handmade',
    display_name: 'Warm & Handmade',
    description: 'A personal, hand-assembled collage feel over real photos.',
    preview_image_url: '/style-previews/warm_handmade.png',
    typography: {
      display_font: 'Fredoka',
      body_font: 'Kalam',
      treatment: 'Thick rounded organic sans for titles (soft, custom feel); delicate high-tracked serif or casual handwritten script for subtext and callouts.',
    },
    layout_descriptor: 'Layered card-on-canvas structure over lifestyle photo backgrounds — torn-paper textures, dashed-border cards, angled phone mockups, push-pins anchoring elements to the canvas.',
    hook_technique: 'Skeuomorphic tactile elements (3D push-pins, torn paper, hand-drawn arrows/stars/sparkles) combined with custom vector outlines tracing objects in the photo to create a personal, physical-collage feel.',
    // cream/kraft canvas, warm brown, soft amber
    implied_tone: { background: '#F4ECDD', primary: '#4A3728', accent: '#E08A3C' },
  },
  sharp_professional: {
    id: 'sharp_professional',
    display_name: 'Sharp & Professional',
    description: 'Structured, educational, walkthrough-style slides.',
    preview_image_url: '/style-previews/sharp_professional.png',
    typography: {
      display_font: 'Archivo',
      body_font: 'Inter',
      treatment: 'Extra-bold hyper-compressed ultra-tall sans display caps with tight leading; clean mid-weight geometric sans for body/bullets; occasional handwritten script for conversational subheadlines only.',
    },
    layout_descriptor: 'Rigid split horizontal grid (upper/lower hemispheres divided by a thin rule), solid square page-number block in a corner, minimalist vector utility icons, left-aligned bullets — OR centered dashboard/software screenshots with heavy textured airbrush framing and hand-drawn pointer arrows.',
    hook_technique: 'Structural rigidity and micro-enclosures (boxed page numbers, rule lines) signaling organized educational content, OR real software UI screenshots framed with grunge/airbrush borders and faux click-pointer icons mimicking an active walkthrough.',
    // cool slate canvas, crisp off-white, sharp cyan
    implied_tone: { background: '#0F172A', primary: '#F8FAFC', accent: '#38BDF8' },
  },
  premium_editorial: {
    id: 'premium_editorial',
    display_name: 'Premium & Editorial',
    description: 'Magazine-grade, cinematic, or native-feed camouflage.',
    preview_image_url: '/style-previews/premium_editorial.png',
    typography: {
      display_font: 'Playfair Display',
      body_font: 'Inter',
      treatment: 'Clean lowercase sans or ultra-bold high-contrast serif display headlines paired with a fluid elegant italic serif for accent words; geometric sans body with selective bolding; thin step-indicator rules at top margins where multi-step.',
    },
    layout_descriptor: 'Open, generous-whitespace grid over full-bleed studio/lifestyle photography or moody atmospheric backgrounds; centered surreal 3D elements or photographic cutouts; clean white rounded cards for comparisons; optionally native-app UI camouflage (context menus, notification pills, profile bars) replicated full-bleed.',
    hook_technique: 'Cinematic/surreal photographic concepts OR complete native-interface camouflage (the slide looks like a real social post, not a deck) — both aimed at premium, editorial-magazine perception.',
    // off-white editorial canvas, near-black, muted bronze jewel
    implied_tone: { background: '#F7F5F1', primary: '#141414', accent: '#7A5C3E' },
  },
}

export const STYLE_LIST: StyleDescriptor[] = [
  STYLE_LIBRARY.bold_personal,
  STYLE_LIBRARY.clean_direct,
  STYLE_LIBRARY.warm_handmade,
  STYLE_LIBRARY.sharp_professional,
  STYLE_LIBRARY.premium_editorial,
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- styleLibrary`
Expected: PASS, 3 tests.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/designSystem/styleLibrary.ts lib/designSystem/styleLibrary.test.ts
git commit -m "feat(design-system): style library with 5 styles + locked implied_tone palettes"
```

---

## Task 3: Color derivation

**Files:**
- Create: `lib/designSystem/colorDerivation.ts`
- Test: `lib/designSystem/colorDerivation.test.ts`
- Modify: `package.json` (culori dep)

- [ ] **Step 1: Install culori**

```bash
npm install culori@^4
```

- [ ] **Step 2: Write the failing test**

Create `lib/designSystem/colorDerivation.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { wcagContrast } from 'culori'
import { derivePalette } from './colorDerivation'

const HEX = /^#[0-9a-fA-F]{6}$/

describe('derivePalette', () => {
  it('echoes a normalized primary and returns valid hex triad', () => {
    const p = derivePalette('clean_direct', '#111827')
    expect(p.primary).toMatch(HEX)
    expect(p.accent).toMatch(HEX)
    expect(p.background).toMatch(HEX)
  })

  it('light-canvas style yields a light background readable against the primary', () => {
    const p = derivePalette('clean_direct', '#111827')
    expect(wcagContrast(p.primary, p.background)).toBeGreaterThanOrEqual(4.5)
  })

  it('dark-canvas style yields a dark background readable against a light primary', () => {
    const p = derivePalette('bold_personal', '#FFFFFF')
    expect(wcagContrast(p.primary, p.background)).toBeGreaterThanOrEqual(4.5)
  })

  it('contrast guard flips the background when the naive choice would be illegible', () => {
    // dark primary on a dark-canvas style would collide; guard must keep it legible
    const p = derivePalette('bold_personal', '#0B0B0F')
    expect(wcagContrast(p.primary, p.background)).toBeGreaterThanOrEqual(4.5)
  })

  it('falls back to a default primary for an unparseable color', () => {
    const p = derivePalette('clean_direct', 'not-a-color')
    expect(p.primary).toMatch(HEX)
    expect(wcagContrast(p.primary, p.background)).toBeGreaterThanOrEqual(4.5)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- colorDerivation`
Expected: FAIL — cannot find module `./colorDerivation`.

- [ ] **Step 4: Write the implementation**

Create `lib/designSystem/colorDerivation.ts`:

```ts
// Derive accent + background from (style, primaryColor). The customer's primary
// color is echoed as `primary`; accent and background are ALWAYS computed — never
// asked. A WCAG contrast guard guarantees the primary is legible on the
// background regardless of input, so the customer-color path and the
// implied_tone fallback path both produce a usable triad.

import { parse, formatHex, converter, wcagContrast } from 'culori'
import type { StyleId, Palette } from './styleLibrary'

const toHsl = converter('hsl')
const DARK_CANVAS: StyleId[] = ['bold_personal', 'sharp_professional']
const FALLBACK_PRIMARY = '#111827'

export function derivePalette(styleId: StyleId, primaryColor: string): Palette {
  const parsed = toHsl(parse(primaryColor))
  const primary = parsed ? formatHex(parsed) : FALLBACK_PRIMARY
  const h = parsed?.h ?? 0
  const s = parsed?.s ?? 0.5

  // Accent: complementary hue, saturated mid-tone pop.
  const accent = formatHex({
    mode: 'hsl',
    h: (h + 150) % 360,
    s: Math.min(0.9, Math.max(0.6, s)),
    l: 0.55,
  })!

  const darkBg = formatHex({ mode: 'hsl', h, s: Math.min(0.18, s), l: 0.06 })!
  const lightBg = formatHex({ mode: 'hsl', h, s: Math.min(0.25, s), l: 0.97 })!

  const prefersDark = DARK_CANVAS.includes(styleId)
  let background = prefersDark
    ? darkBg
    : styleId === 'warm_handmade'
      ? '#F4ECDD'
      : lightBg

  // Guard 1: if the naive choice is illegible, flip light/dark.
  if (wcagContrast(primary, background) < 4.5) {
    background = prefersDark ? lightBg : darkBg
  }
  // Guard 2: last resort — pure white or near-black, whichever reads better.
  if (wcagContrast(primary, background) < 4.5) {
    background =
      wcagContrast(primary, '#FFFFFF') >= wcagContrast(primary, '#0B0B0F')
        ? '#FFFFFF'
        : '#0B0B0F'
  }

  return { primary, accent, background }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- colorDerivation`
Expected: PASS, 5 tests.

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/designSystem/colorDerivation.ts lib/designSystem/colorDerivation.test.ts package.json package-lock.json
git commit -m "feat(design-system): algorithmic accent/background derivation with contrast guard"
```

---

## Task 4: Resolver + Haiku classifier

**Files:**
- Create: `lib/designSystem/resolveDesignSystem.ts`
- Test: `lib/designSystem/resolveDesignSystem.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/designSystem/resolveDesignSystem.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { resolveDesignSystem, type ResolveDeps } from './resolveDesignSystem'
import { STYLE_LIBRARY } from './styleLibrary'

const job = { topic: 'productivity', target_audience: 'founders', outcome: 'ship faster' }
const stubDeps = (id: any = 'warm_handmade'): ResolveDeps => ({
  classifyStyle: vi.fn().mockResolvedValue(id),
})

describe('resolveDesignSystem', () => {
  it('uses the job override first (source = job_override)', async () => {
    const deps = stubDeps()
    const r = await resolveDesignSystem(
      { job: { ...job, style_id: 'bold_personal', primary_color: '#FFFFFF' }, profile: { style_id: 'clean_direct', primary_color: '#000000' } },
      deps
    )
    expect(r.style_id).toBe('bold_personal')
    expect(r.source).toBe('job_override')
    expect(deps.classifyStyle).not.toHaveBeenCalled()
  })

  it('falls back to profile default (source = profile_default)', async () => {
    const deps = stubDeps()
    const r = await resolveDesignSystem(
      { job, profile: { style_id: 'clean_direct', primary_color: '#111827' } },
      deps
    )
    expect(r.style_id).toBe('clean_direct')
    expect(r.source).toBe('profile_default')
    expect(deps.classifyStyle).not.toHaveBeenCalled()
  })

  it('infers via Haiku when neither is set (source = haiku_inferred)', async () => {
    const deps = stubDeps('premium_editorial')
    const r = await resolveDesignSystem({ job, profile: null }, deps)
    expect(r.style_id).toBe('premium_editorial')
    expect(r.source).toBe('haiku_inferred')
    expect(deps.classifyStyle).toHaveBeenCalledOnce()
  })

  it('uses implied_tone triad verbatim when no color is set anywhere', async () => {
    const r = await resolveDesignSystem({ job: { ...job, style_id: 'sharp_professional' }, profile: null }, stubDeps())
    expect({ primary: r.primary_color, accent: r.accent, background: r.background }).toEqual(
      STYLE_LIBRARY.sharp_professional.implied_tone
    )
  })

  it('split_image_cover order: job > profile > false', async () => {
    expect((await resolveDesignSystem({ job: { ...job, style_id: 'clean_direct', split_image_cover: true }, profile: { split_image_cover: false } }, stubDeps())).split_image_cover).toBe(true)
    expect((await resolveDesignSystem({ job: { ...job, style_id: 'clean_direct' }, profile: { split_image_cover: true } }, stubDeps())).split_image_cover).toBe(true)
    expect((await resolveDesignSystem({ job: { ...job, style_id: 'clean_direct' }, profile: null }, stubDeps())).split_image_cover).toBe(false)
  })

  it('treats an invalid stored style_id as unset (falls through)', async () => {
    const deps = stubDeps('warm_handmade')
    const r = await resolveDesignSystem({ job: { ...job, style_id: 'bogus' }, profile: null }, deps)
    expect(r.source).toBe('haiku_inferred')
    expect(r.style_id).toBe('warm_handmade')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- resolveDesignSystem`
Expected: FAIL — cannot find module `./resolveDesignSystem`.

- [ ] **Step 3: Write the implementation**

Create `lib/designSystem/resolveDesignSystem.ts`:

```ts
// Resolve the carousel design system for a job. READ-ONLY: this module performs
// ZERO database writes. It reads plain inputs and returns a value. There is no
// profile-write path here to forget about. Persisting a resolved system is the
// sole job of persistJobStyle (jobs table only).
//
// Style order:  job override -> profile default -> Haiku classification.
// Color order:  job primary  -> profile primary  -> style implied_tone.
// Haiku results are job-scoped (source: 'haiku_inferred') and must NEVER be
// written back to the profile.

import Anthropic from '@anthropic-ai/sdk'
import { STYLE_LIBRARY, type StyleId, type Palette } from './styleLibrary'
import { derivePalette } from './colorDerivation'

export type DesignSystemSource = 'job_override' | 'profile_default' | 'haiku_inferred'

export type ResolvedDesignSystem = {
  style_id: StyleId
  source: DesignSystemSource
  primary_color: string
  accent: string
  background: string
  split_image_cover: boolean
}

export type ClassifyInput = { topic: string; target_audience?: string | null; outcome?: string | null }
export type ResolveDeps = { classifyStyle: (input: ClassifyInput) => Promise<StyleId> }

type JobInput = {
  style_id?: string | null
  primary_color?: string | null
  split_image_cover?: boolean | null
  topic: string
  target_audience?: string | null
  outcome?: string | null
}
type ProfileInput = {
  style_id?: string | null
  primary_color?: string | null
  split_image_cover?: boolean | null
} | null

const VALID_IDS: StyleId[] = ['bold_personal', 'clean_direct', 'warm_handmade', 'sharp_professional', 'premium_editorial']
function asStyleId(v: unknown): StyleId | null {
  return typeof v === 'string' && (VALID_IDS as string[]).includes(v) ? (v as StyleId) : null
}

let _anthropic: Anthropic
function anthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _anthropic
}

// Default classifier — a single Haiku call mirroring the Step-0 niche
// classification in content-generation.ts. Never throws; defaults to a safe
// style on any failure.
export async function classifyStyle(input: ClassifyInput): Promise<StyleId> {
  try {
    const res = await anthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 50,
      messages: [{
        role: 'user',
        content: `Classify this content into ONE carousel design style id.

Topic: ${input.topic}
Audience: ${input.target_audience || ''}
Outcome: ${input.outcome || ''}

Options (pick the best fit):
- bold_personal: huge type, a person facing the reader, punchy and personal
- clean_direct: crisp comparisons, single clear focal point, minimal
- warm_handmade: tactile collage, handwritten feel, personal/cozy
- sharp_professional: structured educational walkthroughs, rigid grids
- premium_editorial: magazine-grade, cinematic, or native-feed camouflage

Respond with ONLY the id, nothing else.`,
      }],
    })
    const text = res.content[0]?.type === 'text' ? res.content[0].text.trim() : ''
    return asStyleId(text) ?? 'clean_direct'
  } catch {
    return 'clean_direct'
  }
}

export async function resolveDesignSystem(
  input: { job: JobInput; profile: ProfileInput },
  deps: ResolveDeps = { classifyStyle }
): Promise<ResolvedDesignSystem> {
  const { job, profile } = input

  // Style
  let style_id: StyleId
  let source: DesignSystemSource
  const jobStyle = asStyleId(job.style_id)
  const profileStyle = asStyleId(profile?.style_id)
  if (jobStyle) {
    style_id = jobStyle
    source = 'job_override'
  } else if (profileStyle) {
    style_id = profileStyle
    source = 'profile_default'
  } else {
    style_id = await deps.classifyStyle({ topic: job.topic, target_audience: job.target_audience, outcome: job.outcome })
    source = 'haiku_inferred'
  }

  // Color
  const primary = job.primary_color || profile?.primary_color || null
  const palette: Palette = primary ? derivePalette(style_id, primary) : STYLE_LIBRARY[style_id].implied_tone

  // Split-image flag
  const split_image_cover = (job.split_image_cover ?? profile?.split_image_cover ?? false) === true

  return {
    style_id,
    source,
    primary_color: palette.primary,
    accent: palette.accent,
    background: palette.background,
    split_image_cover,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- resolveDesignSystem`
Expected: PASS, 6 tests. (No network — `classifyStyle` is injected.)

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/designSystem/resolveDesignSystem.ts lib/designSystem/resolveDesignSystem.test.ts
git commit -m "feat(design-system): read-only resolver + injectable Haiku style classifier"
```

---

## Task 5: persistJobStyle (jobs-only writer)

**Files:**
- Create: `lib/designSystem/persistJobStyle.ts`
- Test: `lib/designSystem/persistJobStyle.test.ts`

- [ ] **Step 1: Write the failing test (enforces jobs-only)**

Create `lib/designSystem/persistJobStyle.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Record every table touched through the admin client.
const touchedTables: string[] = []
const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      touchedTables.push(table)
      return { update: updateMock }
    },
  }),
}))

import { persistJobStyle } from './persistJobStyle'
import type { ResolvedDesignSystem } from './resolveDesignSystem'

const resolved: ResolvedDesignSystem = {
  style_id: 'clean_direct',
  source: 'haiku_inferred',
  primary_color: '#111827',
  accent: '#2563EB',
  background: '#FFFFFF',
  split_image_cover: false,
}

describe('persistJobStyle', () => {
  beforeEach(() => {
    touchedTables.length = 0
    updateMock.mockClear()
  })

  it('writes the jobs table and NEVER the profiles table', async () => {
    await persistJobStyle('job-123', resolved)
    expect(touchedTables).toContain('jobs')
    expect(touchedTables).not.toContain('profiles')
  })

  it('persists style_id, primary_color and split_image_cover', async () => {
    await persistJobStyle('job-123', resolved)
    expect(updateMock).toHaveBeenCalledWith({
      style_id: 'clean_direct',
      primary_color: '#111827',
      split_image_cover: false,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- persistJobStyle`
Expected: FAIL — cannot find module `./persistJobStyle`.

- [ ] **Step 3: Write the implementation**

Create `lib/designSystem/persistJobStyle.ts`:

```ts
import { createAdminClient } from '@/lib/supabase/admin'
import type { ResolvedDesignSystem } from './resolveDesignSystem'

// The ONLY function that persists a resolved/inferred design system. It writes
// the `jobs` table ONLY and must NEVER write `profiles`.
//
// FOOTGUN GUARD: inferred styles are job-scoped. If a future "save this as my
// default" convenience is added, it MUST originate from an explicit user action
// that writes `profiles` directly — it must NOT reuse this path or call this
// function against the profile. Do not add a profiles write here.
export async function persistJobStyle(jobId: string, resolved: ResolvedDesignSystem): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('jobs')
    .update({
      style_id: resolved.style_id,
      primary_color: resolved.primary_color,
      split_image_cover: resolved.split_image_cover,
    })
    .eq('id', jobId)
  if (error) throw error
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- persistJobStyle`
Expected: PASS, 2 tests.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/designSystem/persistJobStyle.ts lib/designSystem/persistJobStyle.test.ts
git commit -m "feat(design-system): persistJobStyle writer (jobs-only) with no-profile-write test"
```

---

## Task 6: Color extraction

**Files:**
- Create: `lib/designSystem/extractColor.ts`
- Test: `lib/designSystem/extractColor.test.ts`
- Modify: `package.json` (node-vibrant dep)

- [ ] **Step 1: Install node-vibrant**

```bash
npm install node-vibrant@^4
```

- [ ] **Step 2: Write the failing test**

Create `lib/designSystem/extractColor.test.ts`. The fixture is a solid warm-amber 8×8 PNG (base64 generated for this plan):

```ts
import { describe, it, expect } from 'vitest'
import { parse, converter } from 'culori'
import { extractDominantColor } from './extractColor'

// Solid warm-amber (#E08A3C) 8x8 PNG.
const AMBER_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGN40GWDFTEMLQkAYi9pgTk2WH4AAAAASUVORK5CYII='

const toRgb = converter('rgb')

describe('extractDominantColor', () => {
  it('returns a valid hex for a solid warm image and reads warm (R > B)', async () => {
    const buf = Buffer.from(AMBER_PNG_B64, 'base64')
    const hex = await extractDominantColor(buf)
    expect(hex).toMatch(/^#[0-9a-fA-F]{6}$/)
    const rgb = toRgb(parse(hex))!
    expect(rgb.r).toBeGreaterThan(rgb.b) // warm
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- extractColor`
Expected: FAIL — cannot find module `./extractColor`.

- [ ] **Step 4: Write the implementation**

Create `lib/designSystem/extractColor.ts`:

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- extractColor`
Expected: PASS, 1 test. If node-vibrant's `/node` entrypoint is unresolved, confirm v4 is installed (`npm ls node-vibrant`); v4 ships the `node-vibrant/node` subpath.

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/designSystem/extractColor.ts lib/designSystem/extractColor.test.ts package.json package-lock.json
git commit -m "feat(design-system): logo dominant-color extraction (node-vibrant, no LLM)"
```

---

## Task 7: Color-extraction API route

**Files:**
- Create: `app/api/design-system/extract-color/route.ts`

Verification is `tsc` + manual (route depends on auth + storage; no unit harness for routes here).

- [ ] **Step 1: Write the route**

Create `app/api/design-system/extract-color/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractDominantColor } from '@/lib/designSystem/extractColor'

// POST: returns the dominant color of the caller's most recent APPROVED logo
// asset. Source is deliberately the reviewed asset (business_assets.asset_type =
// 'logo', status = 'approved') — NOT profiles.logo_url, which is not PII-gated.
// Returns { hex: string | null }. Never throws to the client.
export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    const { data: asset } = await admin
      .from('business_assets')
      .select('file_path')
      .eq('user_id', user.id)
      .eq('asset_type', 'logo')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!asset?.file_path) return NextResponse.json({ hex: null })

    const { data: urlData } = await admin.storage
      .from('job-assets')
      .createSignedUrl(asset.file_path, 3600)

    if (!urlData?.signedUrl) return NextResponse.json({ hex: null })

    const res = await fetch(urlData.signedUrl)
    if (!res.ok) return NextResponse.json({ hex: null })
    const buffer = Buffer.from(await res.arrayBuffer())

    const hex = await extractDominantColor(buffer)
    return NextResponse.json({ hex })
  } catch (err) {
    console.error('[extract-color] failed', err)
    return NextResponse.json({ hex: null })
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual smoke (documented; run after Task 8 migration + with a real approved logo)**

With the dev server running and logged in as a user who has an `approved` `asset_type='logo'` asset:
```bash
# From the browser devtools console while authenticated:
# await (await fetch('/api/design-system/extract-color', { method: 'POST' })).json()
```
Expected: `{ hex: "#......" }`. For a user with no approved logo: `{ hex: null }`.

- [ ] **Step 4: Commit**

```bash
git add app/api/design-system/extract-color/route.ts
git commit -m "feat(design-system): extract-color route (approved logo -> dominant hex)"
```

---

## Task 8: Schema migration

**Files:**
- Create: `supabase/migrations/<timestamp>_design_system.sql` (use a timestamp later than `20260621000002`, e.g. `20260622000001_design_system.sql`)

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260622000001_design_system.sql`:

```sql
-- Carousel design system: per-customer + per-job style and color.
-- Additive only. style_id is free text (validated in app code against StyleId);
-- no DB check constraint, to avoid coupling future style additions to migrations.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS style_id text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS primary_color text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS split_image_cover boolean NOT NULL DEFAULT false;

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS style_id text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS primary_color text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS split_image_cover boolean NOT NULL DEFAULT false;
```

- [ ] **Step 2: Apply the migration to the RunMyPC Supabase project**

Use the Supabase MCP `apply_migration` (name: `design_system`, the SQL above) against the **RunMyPC** project — never FlipBookPro. (Or `supabase db push` if the CLI is linked to RunMyPC.)

- [ ] **Step 3: Verify the columns exist**

Use Supabase MCP `list_tables` (or `execute_sql`) and confirm:
```sql
SELECT table_name, column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name IN ('profiles','jobs')
  AND column_name IN ('style_id','primary_color','split_image_cover')
ORDER BY table_name, column_name;
```
Expected: 6 rows — `style_id` (text), `primary_color` (text), `split_image_cover` (boolean, default false) on both tables.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260622000001_design_system.sql
git commit -m "feat(design-system): migration — style_id/primary_color/split_image_cover on profiles+jobs"
```

---

## Task 9: StylePicker component

**Files:**
- Create: `components/StylePicker.tsx`

Verification: `tsc` + manual visual. The no-orphan-card grid is CSS (not unit-testable); verify visually at breakpoints.

- [ ] **Step 1: Write the component**

Create `components/StylePicker.tsx`:

```tsx
'use client'

import { STYLE_LIST, type StyleId } from '@/lib/designSystem/styleLibrary'

// Visual single-select for the 5 carousel styles. NOT a text dropdown.
//
// No-orphan-card requirement: the grid must never leave a lonely final card
// (the auto-fit "lonely fifth" from the sign-off swatch page). Fixed responsive
// columns + a centered last row handle this: 1 col (mobile) -> 2 (sm) -> 3 (lg);
// `justify-center` centers any short final row so 5 items read as 3+2 centered,
// never 3+1+orphan.
export function StylePicker({
  value,
  onChange,
}: {
  value: StyleId | null
  onChange: (id: StyleId) => void
}) {
  return (
    <div className="flex flex-wrap justify-center gap-3">
      {STYLE_LIST.map(style => {
        const selected = value === style.id
        return (
          <button
            key={style.id}
            type="button"
            onClick={() => onChange(style.id)}
            aria-pressed={selected}
            className={[
              'w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.667rem)]',
              'text-left rounded-xl border overflow-hidden transition',
              selected ? 'border-blue-500 ring-2 ring-blue-500/40' : 'border-gray-200 hover:border-gray-300',
            ].join(' ')}
          >
            {/* Preview image; degrades gracefully to name + description if missing. */}
            <div className="aspect-[4/5] bg-gray-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={style.preview_image_url}
                alt={style.display_name}
                className="h-full w-full object-cover"
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
              />
            </div>
            <div className="p-3">
              <div className="font-semibold text-sm">{style.display_name}</div>
              <div className="text-xs text-gray-500 mt-1">{style.description}</div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (If the project's `Input`/`Button` primitives differ, this component uses only Tailwind + a native `<button>`, so no primitive dependency.)

- [ ] **Step 3: Commit**

```bash
git add components/StylePicker.tsx
git commit -m "feat(design-system): visual StylePicker (no orphan-card grid, graceful image fallback)"
```

---

## Task 10: Profile page wiring

**Files:**
- Modify: `app/profile/page.tsx`

Verification: `tsc` + manual.

- [ ] **Step 1: Extend the `Profile` type and state**

In `app/profile/page.tsx`, find the `Profile` type (currently includes `brand_colors: string | null` near line 20) and add three fields:

```ts
  style_id: string | null
  primary_color: string | null
  split_image_cover: boolean
```

- [ ] **Step 2: Import the picker, styles, and add color pre-fill**

At the top of `app/profile/page.tsx`, add imports:

```ts
import { StylePicker } from '@/components/StylePicker'
import type { StyleId } from '@/lib/designSystem/styleLibrary'
```

Inside the component, after the existing profile-load `useEffect`, add an effect that pre-fills the color from the approved logo when no primary is set yet:

```ts
  useEffect(() => {
    if (!profile || profile.primary_color) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/design-system/extract-color', { method: 'POST' })
        const { hex } = await res.json()
        if (!cancelled && hex) update('primary_color', hex)
      } catch { /* leave picker empty */ }
    })()
    return () => { cancelled = true }
  }, [profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 3: Persist the new fields in `handleSave`**

In `handleSave()` the `.update({ ... })` payload (around line 133) currently lists `brand_tone`, `brand_colors`, etc. Add:

```ts
        style_id: profile.style_id,
        primary_color: profile.primary_color,
        split_image_cover: profile.split_image_cover,
```

- [ ] **Step 4: Render the picker + color + toggle**

In the JSX (near the existing `brand_colors` `Input`, around line 271), add a Design System section:

```tsx
        <div>
          <label className="block text-sm font-medium mb-2">Carousel Style</label>
          <StylePicker
            value={(profile.style_id as StyleId) || null}
            onChange={id => update('style_id', id)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Primary Color</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={profile.primary_color || '#111827'}
              onChange={e => update('primary_color', e.target.value)}
              className="h-10 w-14 rounded border border-gray-200 p-1"
            />
            <Input
              value={profile.primary_color || ''}
              onChange={v => update('primary_color', v)}
              placeholder="#2563EB (optional — auto-filled from your logo)"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="split_image_cover"
            type="checkbox"
            checked={!!profile.split_image_cover}
            onChange={e => setProfile({ ...profile, split_image_cover: e.target.checked })}
          />
          <label htmlFor="split_image_cover" className="text-sm">
            Split-image cover (one image spans the first two slides)
          </label>
        </div>
```

> Note: `update()` is typed `(field: keyof Profile, value: string)`. `style_id`/`primary_color` are strings, so they use `update()`. `split_image_cover` is boolean, so it sets state directly via `setProfile` (shown above) — do not route it through `update()`.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual check (after migration applied)**

Start dev (`npm run dev`), open `/profile`:
- 5 style cards render in a grid with **no orphaned final card** at mobile/tablet/desktop widths; the 3+2 layout is centered.
- Selecting a card highlights it; saving persists `style_id` (reload shows it selected).
- For an account with an approved logo, the color field auto-fills a hex on load; it can be overridden; the swatch and text stay in sync.
- The split-image toggle persists across reload.

- [ ] **Step 7: Commit**

```bash
git add app/profile/page.tsx
git commit -m "feat(design-system): profile style picker, color picker (logo pre-fill), split toggle"
```

---

## Task 11: Job-level override

**Files:**
- Modify: `app/api/jobs/route.ts`
- Modify: `app/page.tsx` (this is the create-job UI — it holds the topic/mode/asset form and POSTs to `/api/jobs` at ~line 83. There is no `app/jobs/new`.)

Verification: `tsc` + manual.

- [ ] **Step 1: Accept + validate overrides in the API route**

In `app/api/jobs/route.ts`, find the `POST` body destructure (around line 137):

```ts
const { topic, target_audience, outcome, mode, flipbookpro_url, selected_asset_ids } = await req.json().catch(() => ({}))
```

Replace it with (adds the three optional override fields):

```ts
const { topic, target_audience, outcome, mode, flipbookpro_url, selected_asset_ids, style_id, primary_color, split_image_cover } = await req.json().catch(() => ({}))
```

Immediately after the existing `mode` validation (the `if (!['full_run', ...].includes(mode))` line ~141), add style validation:

```ts
  const VALID_STYLE_IDS = ['bold_personal', 'clean_direct', 'warm_handmade', 'sharp_professional', 'premium_editorial']
  if (style_id != null && !VALID_STYLE_IDS.includes(style_id)) {
    return NextResponse.json({ error: 'Invalid style_id.' }, { status: 400 })
  }
```

- [ ] **Step 2: Persist overrides on the job row (jobs only)**

Find the `jobs` insert payload in the same `POST` handler (the object containing `mode,` around line 170). Add these fields to that insert object:

```ts
      style_id: style_id ?? null,
      primary_color: primary_color ?? null,
      split_image_cover: split_image_cover === true,
```

(These write only to `jobs` — the per-job override never touches `profiles`.)

- [ ] **Step 3: Add the optional override UI to job creation**

In `app/page.tsx`, add an optional, collapsed-by-default "Override design for this job" section that reuses `StylePicker`. Add imports:

```tsx
import { StylePicker } from '@/components/StylePicker'
import type { StyleId } from '@/lib/designSystem/styleLibrary'
```

Add local state alongside the existing form state:

```tsx
  const [overrideStyle, setOverrideStyle] = useState<StyleId | null>(null)
  const [overrideColor, setOverrideColor] = useState<string>('')
  const [overrideSplit, setOverrideSplit] = useState(false)
```

Render (place near the asset-selection / mode controls):

```tsx
        <details className="rounded-lg border border-gray-200 p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Override design for this job (optional)
          </summary>
          <div className="mt-3 space-y-3">
            <StylePicker value={overrideStyle} onChange={setOverrideStyle} />
            <div className="flex items-center gap-3">
              <input type="color" value={overrideColor || '#111827'}
                onChange={e => setOverrideColor(e.target.value)}
                className="h-10 w-14 rounded border border-gray-200 p-1" />
              <input className="border rounded px-2 py-1 text-sm flex-1"
                value={overrideColor} onChange={e => setOverrideColor(e.target.value)}
                placeholder="#2563EB (optional)" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={overrideSplit}
                onChange={e => setOverrideSplit(e.target.checked)} />
              Split-image cover for this job
            </label>
          </div>
        </details>
```

In the `fetch('/api/jobs', …)` call (~line 83), add the overrides to the `JSON.stringify({ … })` body (the object that already has `topic`/`mode`/`selected_asset_ids` around lines 86–92), only sending them when set:

```tsx
          style_id: overrideStyle ?? undefined,
          primary_color: overrideColor || undefined,
          split_image_cover: overrideSplit || undefined,
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual check**

Create a job with the override section left untouched → the `jobs` row has `style_id = null` (profile default / Haiku will resolve later in Phase C); the user's `profiles` row is unchanged. Create another job with an override style + color set → the `jobs` row stores them; `profiles` still unchanged.

- [ ] **Step 6: Commit**

```bash
git add app/api/jobs/route.ts app/page.tsx
git commit -m "feat(design-system): per-job style/color/split override (jobs-only, validated)"
```

---

## Phase A done — handoff to Phase B

After Task 11: `npm test` (all lib units green) + `npx tsc --noEmit` clean. The design system is now capturable and resolvable; nothing renders yet. Next: **Phase B** (hyperframes-render static-frame mode + bundled fonts), then **Phase C** wires `resolveDesignSystem` + `persistJobStyle` into generation and consumes the fonts/renderer.

Use superpowers:finishing-a-development-branch to integrate Phase A before starting Phase B.
```
