import { describe, it, expect } from 'vitest'
import { resolveOverlapBand, resolveCoverGeometry } from './coverResolver'
import type { SubjectAsset } from './composeCover'

const subj = (bbox: SubjectAsset['bbox']): SubjectAsset => ({
  dataUri: 'data:image/png;base64,AA==',
  hasAlpha: true,
  bbox,
})

describe('resolveOverlapBand — cover geometry', () => {
  it('derives the band from the lower ~20% of the subject bbox', () => {
    // lowerSlice = 540 + 810*0.78 = 1171.8 → /1350*100 = 86.8 → round 87
    expect(resolveOverlapBand(subj({ x: 120, y: 540, w: 840, h: 810 })))
      .toEqual({ topPct: 87, bottomPct: 100 })
  })

  it('clamps topPct to 92 so the front slice never collapses to nothing', () => {
    // lowerSlice = 1200 + 300*0.78 = 1434 → /1350*100 = 106.2 → clamp 92
    expect(resolveOverlapBand(subj({ x: 0, y: 1200, w: 1080, h: 300 })))
      .toEqual({ topPct: 92, bottomPct: 100 })
  })

  it('falls back to a blind 55% band when there is no subject', () => {
    expect(resolveOverlapBand(null)).toEqual({ topPct: 55, bottomPct: 100 })
  })
})

describe('resolveCoverGeometry — 2D intrusion gate', () => {
  it('keeps overlap layout when subject bbox stays clear of the vulnerable headline zone', () => {
    // lowerSlice = 1250 + 100*0.78 = 1328 → band topPct clamp 92 → bandTopPx = 1242
    // bbox.y (1250) >= bandTopPx (1242) → does not rise above the front band
    expect(resolveCoverGeometry(subj({ x: 200, y: 1250, w: 680, h: 100 })))
      .toEqual({ layoutMode: 'overlap', overlapBand: { topPct: 92, bottomPct: 100 } })
  })

  it('rejects overlap layout for a raised-arm bbox that crosses the headline column above the band', () => {
    // lowerSlice = 150 + 1100*0.78 = 1008 → band topPct 75 → bandTopPx = 1012.5
    // bbox.y (150) < bandTopPx and bbox spans x:400-900, inside the 72-1008 safe zone
    expect(resolveCoverGeometry(subj({ x: 400, y: 150, w: 500, h: 1100 })))
      .toEqual({ layoutMode: 'stacked', reason: 'headline_intrusion' })
  })

  it('falls back to the blind overlap band when there is no subject', () => {
    expect(resolveCoverGeometry(null))
      .toEqual({ layoutMode: 'overlap', overlapBand: { topPct: 55, bottomPct: 100 } })
  })
})
