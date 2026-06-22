// Phase C carousel generation — shared types.
import type { ResolvedDesignSystem } from '@/lib/designSystem/resolveDesignSystem'

// cover uses 'hook'; dynamic middle beats are 'value'; the final slide is 'cta'.
export type SlideBeat = 'hook' | 'value' | 'cta'

export type SlidePlan = {
  index: number // 0-based; 0 = cover
  beat: SlideBeat
  isCover: boolean
  text: string // the line of copy for this slide
}

export type CarouselSlideResult = {
  index: number
  beat: SlideBeat
  png: Buffer
}

export type GenerateCarouselResult = {
  resolved: ResolvedDesignSystem
  slides: CarouselSlideResult[] // ordered; cover first, cta last
}
