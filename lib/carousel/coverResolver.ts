// Cover geometry resolver. Given the resolved subject cutout (with its bbox),
// computes WHERE the headline crosses in front of the figure. This is a layout
// decision — it lives HERE, not in the painter. composeCover (the adapter)
// consumes the band and blindly paints it.
//
// Separate stage because the band depends on the subject's actual bounds, which
// only exist AFTER the AssetProvider returns the cutout — so it can't live in
// planCover (which runs before assets). Pipeline:
//   planCover → AssetProvider → resolveOverlapBand → composeCover
import type { SubjectAsset } from './composeCover'

// Only the lower slice of the figure carries type in front — the rest occludes
// the headline (the type-behind-subject effect). Spanning the whole figure would
// erase that effect. Bias to the bottom ~20% of the subject.
export function resolveOverlapBand(
  subject: SubjectAsset | null
): { topPct: number; bottomPct: number } {
  if (!subject) return { topPct: 55, bottomPct: 100 }
  const lowerSlice = subject.bbox.y + subject.bbox.h * 0.78
  const topPct = Math.max(0, Math.min(92, Math.round((lowerSlice / 1350) * 100)))
  return { topPct, bottomPct: 100 }
}

// Band above only covers vertical occlusion. A subject whose bbox reaches into
// the headline's x-range while rising above the band (raised arm, etc.) still
// paints over the headline unopposed — type-back is behind the subject there.
// ponytail: 72px/96px mirror composeCover's .headline-layer padding + slideHtml's
// grid gutters, duplicated rather than imported — same pattern already used
// between those two files, not worth a shared constants module for two numbers.
const HEADLINE_SAFE_X = { left: 72, right: 1008 } // 1080 - 72

function intrudesHeadline(subject: SubjectAsset, band: { topPct: number }): boolean {
  const { x, y, w } = subject.bbox
  const horizontalOverlap = x < HEADLINE_SAFE_X.right && x + w > HEADLINE_SAFE_X.left
  const risesAboveFrontBand = y < (band.topPct / 100) * 1350
  return horizontalOverlap && risesAboveFrontBand
}

// Only 'headline_intrusion' is emitted today (the only check implemented).
// The others are reserved so future checks (e.g. an oversized-subject guard)
// can slot into the same union without another renderer-facing type change.
export type StackedReason = 'headline_intrusion' | 'subject_too_large' | 'subject_missing' | 'low_confidence'

export type CoverGeometry =
  | { layoutMode: 'overlap'; overlapBand: { topPct: number; bottomPct: number } }
  | { layoutMode: 'stacked'; reason: StackedReason }

// No heuristic repositioning on intrusion — just reject the overlap layout and
// signal a structurally safe fallback (headline/subject in disjoint zones).
export function resolveCoverGeometry(subject: SubjectAsset | null): CoverGeometry {
  const overlapBand = resolveOverlapBand(subject)
  if (subject && intrudesHeadline(subject, overlapBand)) {
    return { layoutMode: 'stacked', reason: 'headline_intrusion' }
  }
  return { layoutMode: 'overlap', overlapBand }
}
