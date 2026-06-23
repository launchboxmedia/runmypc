// Phase C carousel generation — shared types.
import type { ResolvedDesignSystem } from '@/lib/designSystem/resolveDesignSystem'

// All beats a carousel slide can carry. 'hook' is always slide 0 (isCover).
// 'problem' and 'payoff' are new beats added by generateCarouselBeats.
export type SlideBeat = 'hook' | 'problem' | 'value' | 'payoff' | 'cta'

// Per-slide beat produced by generateCarouselBeats. Every field except title
// is optional — the model includes only what that beat genuinely needs.
export type CarouselBeat = {
  beat: SlideBeat
  isCover: boolean   // true only for the hook slide (index 0)
  index: number      // 0-based, 0 = cover
  title: string      // required, ≤ ~8 words
  subhead?: string   // ≤ 2 lines
  calloutBox?: string
  bullets?: string[]
  checklist?: string[]
  bottomAnchor?: string
  body?: string      // rare; hard cap 2 lines max
}

export type CarouselSlideResult = {
  index: number
  beat: SlideBeat
  buffer: Buffer     // MP4 bytes (animated render output)
}

export type GenerateCarouselResult = {
  resolved: ResolvedDesignSystem
  slides: CarouselSlideResult[] // ordered; cover first, cta last
}
