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
// erase that effect. Band starts at ~35% down the subject (not lower — headline
// blocks are short and never reach past the subject's midsection; a lower band
// has nothing to cross in front of).
export function resolveOverlapBand(
  subject: SubjectAsset | null
): { topPct: number; bottomPct: number } {
  if (!subject) return { topPct: 55, bottomPct: 100 }
  const lowerSlice = subject.bbox.y + subject.bbox.h * 0.35
  const topPct = Math.max(0, Math.min(92, Math.round((lowerSlice / 1350) * 100)))
  return { topPct, bottomPct: 100 }
}

function hasValidBbox(subject: SubjectAsset): boolean {
  const { x, y, w, h } = subject.bbox
  return [x, y, w, h].every(Number.isFinite) && w > 0 && h > 0
}

// Only 'invalid_bbox' is emitted today (the only check implemented). The
// others are reserved so future checks (e.g. an oversized-subject guard) can
// slot into the same union without another renderer-facing type change.
export type StackedReason = 'subject_too_large' | 'subject_missing' | 'low_confidence' | 'invalid_bbox'

export type CoverGeometry =
  | { layoutMode: 'overlap'; overlapBand: { topPct: number; bottomPct: number } }
  | { layoutMode: 'stacked'; reason: StackedReason }

// Overlap is the default editorial composition for any subject with a usable
// bbox. Stacked is an emergency fallback, not a normal-case gate.
export function resolveCoverGeometry(subject: SubjectAsset | null): CoverGeometry {
  const geometry: CoverGeometry =
    subject && !hasValidBbox(subject)
      ? { layoutMode: 'stacked', reason: 'invalid_bbox' }
      : { layoutMode: 'overlap', overlapBand: resolveOverlapBand(subject) }
  return geometry
}
