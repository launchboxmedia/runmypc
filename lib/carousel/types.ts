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
  proofImageUri?: string  // optional proof/testimonial image for body slides
  slideComponent?: 'cover' | 'narrative' | 'stat_callout' | 'proof' | 'cta'
  highlightWord?: string  // one power word from hook title; rendered with accent highlight
  // CTA Manychat automation fields (cta beat only)
  automationKeyword?: string          // 1–3 words users type to trigger the flow
  ctaInstagramInstructions?: string   // optimized for IG comment automation
  ctaTiktokInstructions?: string      // optimized for TikTok DM automation
  // ── Layout directives (drive deterministic render rails) ──
  visualFocusIntent?: string                       // what the eye should land on
  forceContrastMode?: 'light' | 'dark' | 'auto'    // dark → scrim + white text
  showSwipeIndicator?: boolean                     // render right-edge swipe teaser
  paginationIndex?: number                         // slide number for the page counter
}

// Competitive positioning stance forwarded from the job. 'destroy' = aggressive
// anti-competitor; 'mimic' = model the proven winners.
export type CarouselStance = 'destroy' | 'mimic'

export type CarouselSlideResult = {
  index: number
  beat: SlideBeat
  buffer: Buffer     // MP4 bytes (animated render output)
}

export type GenerateCarouselResult = {
  resolved: ResolvedDesignSystem
  slides: CarouselSlideResult[] // ordered; cover first, cta last
}
