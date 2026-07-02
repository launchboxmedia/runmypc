import { describe, it, expect } from 'vitest'
import { resolveOverlapBand, resolveCoverGeometry } from './coverResolver'
import type { SubjectAsset } from './composeCover'

const subj = (bbox: SubjectAsset['bbox']): SubjectAsset => ({
  dataUri: 'data:image/png;base64,AA==',
  hasAlpha: true,
  bbox,
})

describe('resolveOverlapBand — cover geometry', () => {
  it('derives the band starting ~35% down the subject bbox', () => {
    // lowerSlice = 540 + 810*0.35 = 823.5 → /1350*100 = 61.0 → round 61
    expect(resolveOverlapBand(subj({ x: 120, y: 540, w: 840, h: 810 })))
      .toEqual({ topPct: 61, bottomPct: 100 })
  })

  it('clamps topPct to 92 so the front slice never collapses to nothing', () => {
    // lowerSlice = 1200 + 300*0.35 = 1305 → /1350*100 = 96.7 → clamp 92
    expect(resolveOverlapBand(subj({ x: 0, y: 1200, w: 1080, h: 300 })))
      .toEqual({ topPct: 92, bottomPct: 100 })
  })

  it('falls back to a blind 55% band when there is no subject', () => {
    expect(resolveOverlapBand(null)).toEqual({ topPct: 55, bottomPct: 100 })
  })
})

describe('resolveCoverGeometry — 2D intrusion gate', () => {
  it('keeps overlap layout when subject bbox stays clear of the vulnerable headline zone', () => {
    // lowerSlice = 1250 + 100*0.35 = 1285 → /1350*100 = 95.2 → clamp 92
    expect(resolveCoverGeometry(subj({ x: 200, y: 1250, w: 680, h: 100 })))
      .toEqual({ layoutMode: 'overlap', overlapBand: { topPct: 92, bottomPct: 100 } })
  })

  it('keeps overlap layout for a raised-arm bbox that crosses the headline column above the band', () => {
    // lowerSlice = 150 + 1100*0.35 = 535 → /1350*100 = 39.6 → round 40
    expect(resolveCoverGeometry(subj({ x: 400, y: 150, w: 500, h: 1100 })))
      .toEqual({ layoutMode: 'overlap', overlapBand: { topPct: 40, bottomPct: 100 } })
  })

  it('rejects overlap layout for a corrupt bbox', () => {
    expect(resolveCoverGeometry(subj({ x: 400, y: 150, w: 0, h: 1100 })))
      .toEqual({ layoutMode: 'stacked', reason: 'invalid_bbox' })
  })

  it('falls back to the blind overlap band when there is no subject', () => {
    expect(resolveCoverGeometry(null))
      .toEqual({ layoutMode: 'overlap', overlapBand: { topPct: 55, bottomPct: 100 } })
  })
})
