# Design System Everywhere — Phase D Spec

**Date:** 2026-06-22
**Status:** Approved (autonomous build authorized by user)
**Branch:** `carousel-phase-d`

## Context

Phases A–C gave each job a resolved design system (`{ style_id, primary_color,
accent, background, split_image_cover, source }`) but only the **carousel** (Phase C)
consumes it. The other visual outputs ignore it:

- **Static creatives** (`content-generation.ts` Step 3): 6 GPT-Image-2 images whose
  prompts use a flat `profile.brand_colors` fallback + generic "clean bold" language.
- **Cinematic hero** (Step 7): Seedance video, brand-neutral prompt, no palette/style.
- **Ads** (`ad-generation.ts`): copy only — no image/video. **Out of scope** (nothing
  visual to style).

Result: the campaign isn't visually cohesive with the style the customer picked.

## Goal

Thread the resolved design system (palette hexes + style aesthetic) into the static
and cinematic prompt builders, and resolve it **once** per job so every visual output
uses the same style. Depth = color + aesthetic prompt injection (image/video models
honor prompt guidance but can't be pixel-forced; the carousel remains the
pixel-perfect output via composited HTML).

## Architecture

### 1. Resolve once, early

In `executeContentGeneration`, after the profile load (currently ~line 80, before
Step 1 research) compute the design system a single time:

```ts
const { resolveDesignSystem } = await import('@/lib/designSystem/resolveDesignSystem')
const resolvedDesign = await resolveDesignSystem({
  job: {
    style_id: job.style_id, primary_color: job.primary_color,
    split_image_cover: job.split_image_cover,
    topic: job.topic, target_audience: job.target_audience, outcome: job.outcome,
  },
  profile: profile
    ? { style_id: profile.style_id, primary_color: profile.primary_color, split_image_cover: profile.split_image_cover }
    : null,
})
```

`resolvedDesign` is in scope for Steps 3, 4, 7. `persistJobStyle(jobId, resolvedDesign)`
is called once here (replacing the Phase C call inside Step 4). `resolveDesignSystem`
never throws (Phase A guarantee). One Haiku classify per job instead of up to three.

### 2. Shared helper — `lib/designSystem/describeForPrompt.ts`

Pure, no I/O. Turns a resolved system into a compact prompt fragment reused by image
and video callers.

```ts
import { STYLE_LIBRARY } from './styleLibrary'
import type { ResolvedDesignSystem } from './resolveDesignSystem'

// A compact natural-language description of the visual design system, for
// embedding in image/video generation prompts. Deterministic, never throws.
export function describeDesignSystem(resolved: ResolvedDesignSystem): string {
  const s = STYLE_LIBRARY[resolved.style_id]
  return [
    `Visual style: ${s.display_name} — ${s.typography.treatment}.`,
    `Aesthetic: ${s.hook_technique}`,
    `Color palette: background ${resolved.background}, primary ${resolved.primary_color}, accent ${resolved.accent}. Use these colors as the dominant palette.`,
  ].join(' ')
}
```

(Unknown `style_id` is impossible — `resolved.style_id` is a validated `StyleId`.)

### 3. Static creatives (Step 3)

- Remove the `brandColor` flat fallback usage in the 6 `CREATIVE_SPECS` prompts.
- Each prompt becomes: purpose/format + topic + audience + `describeDesignSystem(resolvedDesign)`.
  Example (Instagram Square):
  ```ts
  prompt: `Professional social media creative for Instagram. Topic: ${primaryTopic}. Target audience: ${job.target_audience || 'general'}. ${designFragment} Clean, bold, scroll-stopping, illustrative (not a fake screenshot).`
  ```
  where `const designFragment = describeDesignSystem(resolvedDesign)` is computed once
  before the specs array. The per-platform `label`/`size` are unchanged.
- `profile.brand_colors` is no longer read for statics (the resolved palette supersedes
  it; the resolver already incorporated the customer's primary color in Phase A).

### 4. Cinematic hero (Step 7)

Append the fragment to the Seedance prompt as color/mood guidance, preserving the
existing "No text overlay. Pure visual storytelling." line:

```ts
const prompt = `A bold, modern cinematic vertical video about: ${selectedTopic}.
${factsContext ? `Key context: ${factsContext}` : ''}
${describeDesignSystem(resolvedDesign)}
Style: high production value, dynamic camera movement, clean professional lighting,
cohesive contemporary aesthetic. Apply the color palette above as the grade/mood.
9:16 vertical format for social media.
No text overlay. Pure visual storytelling.`
```

### 5. Carousel (Step 4) — consume the pre-resolved system

`generateCarousel` currently calls `resolveDesignSystem` internally. Add an optional
`resolved?: ResolvedDesignSystem` input; when provided, skip the internal resolve and
use it. Step 4 passes `resolvedDesign`. Behavior identical, but no double-resolve and
the carousel is guaranteed to match the statics/cinematic style. `persistJobStyle`
moves out of Step 4 (now done once at the top); Step 4 no longer persists.

## Files

- **Create** `lib/designSystem/describeForPrompt.ts` + `describeForPrompt.test.ts`.
- **Modify** `lib/workflows/content-generation.ts`: resolve-once block + persist; Step 3
  prompts; Step 7 prompt; Step 4 passes `resolved`, drops its own resolve/persist.
- **Modify** `lib/carousel/generateCarousel.ts`: accept optional `resolved`.

## Error handling

- `resolveDesignSystem` never throws (Phase A). If profile is null, resolver handles it.
- `describeDesignSystem` is pure over validated data — never throws.
- `persistJobStyle` failure is caught + logged (non-fatal), as in Phase C.
- Statics/cinematic generation failures keep their existing per-step try/catch.

## Testing / verification

- **Unit (`describeForPrompt.test.ts`):** output contains the style display name, the
  treatment text, and all three palette hexes; deterministic for a fixed input; runs
  for every `StyleId` without throwing.
- `npx tsc --noEmit` clean.
- **Live spot-check (cohesion):** for one style with a customer primary color, generate
  ONE static creative image and Read it — confirm the palette/aesthetic visibly tracks
  the resolved style (vs the old generic look). Cinematic is verified by asserting the
  built prompt string contains `describeDesignSystem(resolvedDesign)` (skip the slow,
  costly video render).
- **Regression:** carousel still renders (Step 4 path unchanged aside from receiving
  `resolved`); existing carousel live harness still passes.

## Out of scope

- Per-style structural/layout templating of statics or cinematic (depth deferred;
  prompt-level color+aesthetic only).
- Ads (text only).
- Any render-service or schema change.
