import { describe, it, expect } from 'vitest'
import { resolveOverlapBand } from './coverResolver'
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
