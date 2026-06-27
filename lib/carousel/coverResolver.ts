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
