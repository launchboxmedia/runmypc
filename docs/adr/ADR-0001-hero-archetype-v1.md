# ADR-0001: Hero Archetype v1

Status: Accepted (frozen baseline)

## Context

Early editorial cover generation had no reliable depth or editorial feel:

- Compositions were flat — headline and subject did not interact.
- `coverResolver.ts`'s intrusion gate (`intrudesHeadline`) fired on nearly every centered portrait subject, forcing `layoutMode: 'stacked'` almost unconditionally. The sandwich compositor existed in code but was effectively unreachable.
- Subject poses (raised "stop" hands, pointing) frequently produced large opaque blocks directly over the headline, destroying readability wherever they did overlap.

Hero Archetype v1 is the result of resolving all three problems and validating the result against a 5-case benchmark (`lib/carousel/heroBenchmark.live.test.ts`).

## Decision

Adopt a deterministic, renderer-owned compositing pipeline for the Hero archetype:

```
BACKGROUND
  ↓
TYPE_BACK
  ↓
SUBJECT (alpha cutout)
  ↓
TYPE_FRONT (clip-path)
  ↓
BADGES
```

Composition is owned by the renderer (`composeCover.ts`), not the image model. The subject and background are generated as separate assets (`assetProvider.ts`) with no compositing responsibility; `composeCover.ts` stacks them via CSS z-order and a `clip-path` band computed by `coverResolver.ts`. This keeps the effect deterministic and inspectable, instead of depending on a model to composite pixels correctly.

## Geometry

Overlap is the default layout for any subject with a valid bbox. `coverResolver.resolveCoverGeometry` previously rejected overlap whenever a subject's bbox crossed into the headline's x-range and rose above the crossing band — which, for a bottom-anchored centered portrait, is nearly always true. That gate mistook the *editorial intent* (type crosses in front of the subject) for a layout defect. It has been removed; `layoutMode: 'stacked'` is now reserved for an actually invalid bbox (non-finite coordinates, non-positive width/height), not a normal composition.

The overlap band's crossing point (`resolveOverlapBand`, `lib/carousel/coverResolver.ts`) is calibrated at `0.35` — roughly the subject's upper chest, measured down from the top of the bbox. This was empirically validated: the original constant (`0.78`, biased to the lower ~20% of the figure) put the crossing line near the ankles, where short 3–5 word Hero headlines never reach — the front-occlusion effect existed in code but was never visible in any real render. Lowering it to intersect the chest/shoulder line puts it inside the vertical span the headline actually occupies. `0.35` is the current Hero v1 calibration, chosen by rendering the 5-case benchmark and visually confirming the weave (headline text crossing in front of the torso) actually appears.

## Typography

Hero uses oversized, heavy, tight-set display type:

- +15% headline scale over the style's base `title_hero_size` / `title_size`.
- `font-weight: 900`.
- `letter-spacing: -0.02em`.
- `line-height: 0.9`.

Partial occlusion by the subject is an intentional editorial device, not a defect to be avoided — the type is meant to read as dominant even when a cutout passes in front of or behind it. Readability under occlusion is preserved primarily through scale and weight (bigger, bolder glyphs survive a crossing silhouette; small/thin type does not), not by trying to prevent overlap from happening.

## Alignment

Hero standardizes on left-aligned headlines (existing `.headline-layer` flex/padding, unchanged).

Centered alignment (`align-items: center; text-align: center`) was benchmarked head-to-head against the left baseline using identical generated assets for both variants (`lib/carousel/__ab-alignment.test.ts`, temporary — not part of the codebase). Centered alignment consistently produced heavier, more destructive occlusion (whole words vanishing behind the face rather than a few clipped letters at an edge), slower reading, and a composition that read as fashion-poster/gig-flyer rather than the premium editorial masthead references this style targets. Left alignment was kept as the Hero v1 baseline.

## Subject Direction

Subject prompts (`lib/carousel/editorialPlan.ts`) constrain pose to a restrained editorial silhouette: arms near the body or crossed, hands resting near pockets/clothing, calm vertical posture. Explicit negative constraints rule out stop gestures, pointing, hands reaching toward camera, and any raised limb crossing the upper body or face.

This exists because the style's `hook_technique` direction (`styleLibrary.ts`) references "a direct physical gesture (e.g. a stopping hand) aimed at the reader," which the image model took literally on every generation — producing a raised forearm that crossed straight through the headline zone on all 5 benchmark cases, consuming far more of the primary copy than the intended crossing-band occlusion. A strong vertical figure interrupts the typography without overwhelming it; a raised limb overwhelms it.

## Tradeoffs

Explicitly rejected during this work, and why:

- **Stacked layout as the default** — was the previous (buggy) behavior. Rejected because it disabled the sandwich compositor entirely; overlap is the intended editorial composition, not an error state.
- **Centered headline** — rejected per the alignment A/B above: heavier facial occlusion, slower reading, poster-like rather than editorial feel.
- **Lower-body overlap band (`0.78`)** — rejected because it placed the crossing line below where any realistic Hero headline reaches, making the weave effect invisible in practice.
- **Raised-hand / stop-gesture hero poses** — rejected because they produced large, uncontrolled opaque blocks over the headline, as opposed to the graceful partial occlusion the compositor is designed around.

## Future Work (do not implement against this ADR)

These are noted as future directions only — implementing any of them is out of scope for Hero v1 and should not be read as a mandate to revisit the decisions above:

- Adaptive overlap band derived from actual headline block metrics (height/line count) instead of a fixed fraction of subject bbox height.
- Additional editorial archetypes beyond Hero (`magazine`, `collage`, `split` — see `CoverArchetype` in `editorialPlan.ts`).
- Automatic typography fit / optical balancing (Tier-2, already flagged as deferred in `composeCover.ts`).
- Pose-aware composition (choosing overlap band or layout based on detected subject pose, not just bbox).
