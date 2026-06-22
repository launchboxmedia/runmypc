# Carousel Design System — Phase A Design Spec

**Date:** 2026-06-22
**Status:** Approved (design), pending spec review → implementation plan

## Decomposition context (3 phases)

The full carousel feature (per master spec) is split into three independently
testable sub-projects, each its own spec → plan → implement cycle:

- **Phase A (this doc):** Design-system capture + resolution. Style library
  config, schema, profile/job UI, pure resolver, color extraction/derivation.
  **No rendering.** Lives entirely in `runmypc`; no external dependency.
- **Phase B:** Hyperframes render service — static-frame `render_mode` + bundled
  fonts. Lives in the separate `hyperframes-render` repo
  (`C:\Users\mjohn\Documents\LaunchBox.Media\hyperframes-render`, Vercel-linked,
  authed as `launchboxmedia`). Built, deployed (`vercel deploy --prod`), and
  font-render-verified by Claude Code in one loop.
- **Phase C:** Generation — cover (2 variants + vision scoring + composite),
  split-image cover, body slides, visual quality gate, storage, dashboard.
  Depends on Phase B being deployed and verified.

This spec covers **Phase A only**. Phases B and C get their own specs.

## Goal

A customer (or a single job, or Haiku inference) selects a **style** and a
**primary color**; the system resolves a complete `{ style_id, primary_color,
accent, background }` design system. Phase A delivers the configuration, schema,
UI, and a **pure resolver** consumed later by Phase C. Nothing renders in Phase A.

## Architecture

A self-contained `lib/designSystem/` module of small, single-purpose units:

```
lib/designSystem/
  styleLibrary.ts        # 5 StyleDescriptor entries + implied_tone palettes (const data + types)
  colorDerivation.ts     # primary + style -> { accent, background }; pure
  resolveDesignSystem.ts # job -> profile -> Haiku resolution; READ-ONLY (no DB writes)
  persistJobStyle.ts     # the ONLY writer; writes jobs table ONLY (never profiles)
  extractColor.ts        # dominant color from a logo image buffer; no LLM
```

Plus: one SQL migration, one server API route for color extraction, profile-page
UI (style picker + color picker), and job-creation override capture.

### Data flow

1. **Profile setup:** on load, if an `approved` brand-suitable logo asset exists,
   the color-extraction route returns a dominant hex → pre-fills the color
   picker. Customer picks a style card and (optionally) overrides the color, and
   toggles `split_image_cover`. Saved to `profiles`.
2. **Job creation:** customer may optionally override `style_id` /
   `primary_color` / `split_image_cover` for that one job. Saved to `jobs`.
3. **Resolution (consumed in Phase C):** `resolveDesignSystem({ job, profile })`
   returns the full design system using order: **job override → profile default →
   Haiku classification**. Haiku results are job-scoped (`source:
   "haiku_inferred"`) and **never** written back to `profiles`.

## Components

### 1. `lib/designSystem/styleLibrary.ts`

Types + frozen data. No I/O.

```ts
export type StyleId =
  | 'bold_personal'
  | 'clean_direct'
  | 'warm_handmade'
  | 'sharp_professional'
  | 'premium_editorial'

export type Palette = { primary: string; accent: string; background: string }

export type StyleDescriptor = {
  id: StyleId
  display_name: string          // customer-facing
  description: string           // one-line customer-facing
  preview_image_url: string     // for the picker UI
  typography: {
    display_font: string        // contract name; font FILE bundled in Phase B
    body_font: string
    treatment: string           // free text for prompt construction
  }
  layout_descriptor: string     // free text: grid zones, placement
  hook_technique: string        // free text: signature visual device
  // Fallback-ONLY baked palette. Used when job + profile + logo all yield no
  // color. Deliberately NOT sampled from reference images (color = customer).
  // Locked 2026-06-22 with sign-off. Each below carries a rationale comment.
  implied_tone: Palette
}

export const STYLE_LIBRARY: Record<StyleId, StyleDescriptor>
export const STYLE_LIST: StyleDescriptor[]   // ordered for the picker
```

Descriptors (verbatim intent from master spec):

- **bold_personal** — Typography: extreme-weight ultra-bold geometric sans
  display, all caps, massive tracking, tight leading, solid block; no body copy
  on cover. Layout: top-center handle pill, headline upper 45%, large masked
  human/character cutout breaking the lower frame in bottom 55%, swipe badge
  mid-right, page dots bottom center. Hook: high-contrast type scale + realistic
  human cutout doing a direct physical gesture aimed at the reader.
- **clean_direct** — Typography: medium-weight geometric sans subheadline in a
  thin outlined container; clean sentence-case body with heavy bolding on key
  phrases; or heavy display sans + light geometric body for single-asset
  variants. Layout: top-center handle, pill title, then (a) two-column A/B
  comparison mockups with cross/check badges, or (b) single centered asset
  dead-center, type above/below, wide margins. Hook: A/B comparison with
  right/wrong iconography, OR singular centered focal asset with directional
  pointers.
- **warm_handmade** — Typography: thick rounded organic sans titles; delicate
  high-tracked serif or casual script subtext. Layout: layered card-on-canvas
  over lifestyle photo backgrounds — torn paper, dashed-border cards, angled
  phone mockups, push-pins. Hook: skeuomorphic tactile elements (3D pins, torn
  paper, hand-drawn arrows/stars) + custom vector outlines tracing photo objects.
- **sharp_professional** — Typography: extra-bold hyper-compressed ultra-tall
  sans display caps, tight leading; mid-weight geometric sans body/bullets;
  occasional script subheads. Layout: rigid split horizontal grid divided by a
  thin rule, solid square page-number block in a corner, minimal vector icons,
  left-aligned bullets — OR centered dashboard/software screenshots with textured
  airbrush framing + hand-drawn pointer arrows. Hook: structural rigidity +
  micro-enclosures (boxed page numbers, rules) OR real software UI framed with
  grunge/airbrush borders + faux click pointers.
- **premium_editorial** — Typography: clean lowercase sans or ultra-bold
  high-contrast serif display + fluid italic serif accents; geometric sans body
  with selective bolding; thin step-indicator rules where multi-step. Layout:
  open generous-whitespace grid over full-bleed studio/lifestyle photography or
  moody backgrounds; centered surreal 3D elements or photographic cutouts; white
  rounded comparison cards; optionally native-app UI camouflage. Hook:
  cinematic/surreal photographic concepts OR complete native-interface camouflage.

`implied_tone` locked palettes (with rationale comments in code):

| id | background | primary | accent | rationale |
|---|---|---|---|---|
| bold_personal | `#0B0B0F` | `#FFFFFF` | `#FF3B30` | near-black, white type, one hot stop-sign accent |
| clean_direct | `#FFFFFF` | `#111827` | `#2563EB` | bright, ink text, single trustworthy blue |
| warm_handmade | `#F4ECDD` | `#4A3728` | `#E08A3C` | cream/kraft, warm brown, soft amber |
| sharp_professional | `#0F172A` | `#F8FAFC` | `#38BDF8` | cool slate, crisp off-white, sharp cyan |
| premium_editorial | `#F7F5F1` | `#141414` | `#7A5C3E` | off-white editorial, near-black, muted bronze |

### 2. `lib/designSystem/colorDerivation.ts`

```ts
import type { StyleId, Palette } from './styleLibrary'
export function derivePalette(styleId: StyleId, primaryColor: string): Palette
```

`accent` and `background` are **always** derived algorithmically from
`styleId + primaryColor` — never asked of the customer. Pure function, no I/O.

- Lib: **culori** (pure JS, no native deps) for HSL/OKLCH math.
- Rules per style express each style's feel:
  - dark-canvas styles (bold_personal, sharp_professional): background = very dark
    desaturated shade derived from primary's hue; accent = high-chroma
    complementary/analogous pop.
  - light-canvas styles (clean_direct, premium_editorial): background = very light
    tint of primary's hue (near-white); accent = saturated mid-tone of primary or
    a fixed style-appropriate hue offset.
  - warm_handmade: warm cream background regardless of hue; accent = warm amber
    derived from primary lightness.
- Contrast guard: if derived background vs primary contrast < a threshold, push
  background lightness until legible (WCAG-ish ratio). Keeps fallback and
  customer-color paths both legible.

### 3. `lib/designSystem/resolveDesignSystem.ts` — READ-ONLY

```ts
export type DesignSystemSource = 'job_override' | 'profile_default' | 'haiku_inferred'
export type ResolvedDesignSystem = {
  style_id: StyleId
  source: DesignSystemSource
  primary_color: string
  accent: string
  background: string
  split_image_cover: boolean
}

export async function resolveDesignSystem(input: {
  job: { style_id?: string|null; primary_color?: string|null; split_image_cover?: boolean|null;
         topic: string; target_audience?: string|null; outcome?: string|null }
  profile: { style_id?: string|null; primary_color?: string|null; split_image_cover?: boolean|null } | null
}): Promise<ResolvedDesignSystem>
```

**Enforcement (the function CANNOT violate the job-scoped rule):**

- This module performs **zero database writes**. It reads inputs and returns a
  value. There is no profile-write code path here to forget about.
- Style resolution order: job.style_id → profile.style_id → `classifyStyle()`
  (Haiku). `classifyStyle()` is inference only (one Anthropic Haiku call,
  mirroring the existing Step-0 niche classification in
  `content-generation.ts`), returns a `StyleId`, writes nothing.
- Color resolution order: job.primary_color → profile.primary_color →
  `implied_tone[style].primary`. Then `derivePalette` fills accent/background.
  When primary came from `implied_tone`, accent/background = the locked
  `implied_tone` triad (not re-derived).
- `split_image_cover`: job → profile → `false`.

### 4. `lib/designSystem/persistJobStyle.ts` — the ONLY writer

```ts
// The ONLY function that persists a resolved/inferred style. Writes the `jobs`
// table ONLY. It must NEVER write `profiles`.
//
// FOOTGUN GUARD: inferred styles are job-scoped. A future "save this as my
// default" convenience MUST originate from explicit user action writing
// `profiles` directly — it must NOT reuse the inference path. Do not add a
// profile write here.
export async function persistJobStyle(jobId: string, resolved: ResolvedDesignSystem): Promise<void>
```

Writes `jobs.style_id`, `jobs.primary_color`, `jobs.split_image_cover` for the
given job. No `profiles` access. (Wiring the call site is Phase C; the helper +
its guard comment + its test land in Phase A so the contract exists first.)

### 5. `lib/designSystem/extractColor.ts` + API route

```ts
export async function extractDominantColor(image: Buffer): Promise<string>  // returns hex
```

- Lib: **node-vibrant** (server-side, no canvas/native build) — k-means-style
  palette extraction, **no LLM**.
- API route `app/api/design-system/extract-color/route.ts` (POST): given an
  approved logo asset id (or its storage path), generates a signed URL, fetches
  the bytes, runs `extractDominantColor`, returns `{ hex }`. Auth: same session
  pattern as other authenticated routes.
- **Source (explicit):** `business_assets` where `asset_type = 'logo'` AND
  `status = 'approved'` (most recent if several). This is deliberate — the
  extraction source must be a PII-reviewed, approved asset. `profiles.logo_url`
  also exists (a direct profile logo upload) but is **not** review-gated, so it
  is intentionally NOT used for auto-extraction. No qualifying approved logo →
  route returns `{ hex: null }`; the picker stays empty and shows no upload
  prompt.

### 6. Migration — `supabase/migrations/<timestamp>_design_system.sql`

Additive only:

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS style_id text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS primary_color text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS split_image_cover boolean NOT NULL DEFAULT false;

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS style_id text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS primary_color text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS split_image_cover boolean NOT NULL DEFAULT false;
```

(split_image_cover columns land now — cheap, additive; Phase C reads them. No
check constraint on `style_id`: keep it free text to avoid migration coupling;
validation happens in app code against `StyleId`.)

### 7. Profile UI — `app/profile/page.tsx` + `components/StylePicker.tsx`

- `StylePicker`: **visual** single-select — 5 cards, each rendering
  `preview_image_url` + `display_name` + `description`. Not a text dropdown.
  Selecting writes `profile.style_id` via the existing `update()` pattern.
  - **Acceptance criterion (UI polish):** the grid must NOT produce an orphaned
    final card (the auto-fit "lonely fifth" seen in the sign-off swatch page).
    Use a deliberate responsive layout: 5-across on wide screens; a balanced wrap
    at mid widths (no 4+1 orphan); 2-across / stacked on narrow. Center any short
    final row.
  - Graceful degradation: if `preview_image_url` 404s/missing, the card shows
    name + description only (still selectable).
- Color picker: hex text input + native swatch (`<input type="color">`),
  optional. On profile load, call the extract-color route; if it returns a hex
  and `profile.primary_color` is unset, pre-fill (customer can override). Writes
  `profile.primary_color`.
- `split_image_cover`: a labeled toggle, writes `profile.split_image_cover`.
- `handleSave()` extended to persist the three new fields alongside existing ones.

**Preview images (non-blocking):** real `preview_image_url`s are customer-supplied
reference art. Phase A ships paths under `/public/style-previews/<id>.{png,jpg}`
and the degradation above; user drops real images in later.

### 8. Job override — `app/api/jobs/route.ts` + job-new UI

- `POST /api/jobs` accepts optional `style_id`, `primary_color`,
  `split_image_cover`; validates `style_id` against `StyleId` when present;
  persists onto the `jobs` row. Mirrors the existing optional-field handling
  (e.g. `selected_asset_ids`, `service_tag`). Does **not** touch `profiles`.
- Job-creation UI: an optional "override design for this job" section (style
  cards reused from `StylePicker` + color picker + toggle), defaulting to "use my
  profile default".

## Dependencies to add

- `culori` — palette derivation (pure JS).
- `node-vibrant` — dominant-color extraction (server-side, no native build).

## Error handling

- `classifyStyle()` (Haiku) failure → default to a safe style
  (`clean_direct`) with `source: 'haiku_inferred'`; never throw out of the
  resolver.
- `extractDominantColor` failure or no asset → route returns `{ hex: null }`;
  picker simply stays empty. Never blocks profile save.
- `derivePalette` always returns a legible triad (contrast guard); never throws.
- Unknown/invalid `style_id` from DB → treated as unset (falls through
  resolution order).

## Testing / verification

Project convention: `npx tsc --noEmit` after every task; no existing unit-test
harness — Phase A adds lightweight unit tests for the pure logic.

- **Resolver unit tests (the core enforcement):**
  1. job.style_id set → `source: 'job_override'`, uses job values.
  2. job unset, profile.style_id set → `source: 'profile_default'`.
  3. both unset → `source: 'haiku_inferred'` (Haiku mocked).
  4. **No-profile-write test:** run Haiku resolution with a mocked admin client;
     assert `from('profiles').update` is **never** called. Fails if anyone wires
     inference into a profile write.
- **colorDerivation unit tests:** known primary+style → expected legible triad;
  contrast guard pushes background when input would be illegible.
- **Migration:** apply to the RunMyPC Supabase project; confirm 6 columns exist,
  defaults correct, no data loss.
- **Manual:** profile loads and pre-fills a hex from a real approved logo asset;
  style picker renders 5 visual cards with no orphan card at the standard
  breakpoints; per-job override persists to `jobs` without altering `profiles`.
- `npx tsc --noEmit` clean.

## Out of scope (Phase A)

- Any rendering, cover/body slide generation, vision scoring, quality gate
  (Phase C).
- Render service changes / fonts (Phase B).
- Wiring `resolveDesignSystem` / `persistJobStyle` into the generation pipeline
  (Phase C consumes them; Phase A only builds + tests the units).
