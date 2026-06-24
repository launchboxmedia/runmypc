// Zod validation for carousel beats. Validates the LLM's structured output
// against the REAL CarouselBeat shape consumed by the render pipeline
// (slideHtml.ts / ctaKit.ts / compileCarousel) — NOT a parallel schema.
//
// Layout directives (forceContrastMode / showSwipeIndicator / paginationIndex /
// visualFocusIntent) are optional fields the model may emit; the renderer also
// derives sane defaults for them deterministically, so they are never required.
import { z } from 'zod'
import type { CarouselBeat } from './types'

export const SLIDE_BEATS = ['hook', 'problem', 'value', 'payoff', 'cta'] as const
export const SLIDE_COMPONENTS = ['cover', 'narrative', 'stat_callout', 'proof', 'cta'] as const
export const CONTRAST_MODES = ['light', 'dark', 'auto'] as const

// A non-empty automation keyword. NOTE: spaces are intentionally allowed —
// existing Manychat triggers are 1–3 words (e.g. "CREDIT FIX"). The keyword is
// bound to the user's exact input in code, so an anti-space refinement would
// only reject legitimate multi-word keywords.
export const KeywordSchema = z.string().trim().min(1)

// Single validated slide. Mirrors CarouselBeat; every field except the core
// trio (beat / index / title) is optional, matching parseBeatResponse output.
export const CarouselBeatSchema = z.object({
  beat: z.enum(SLIDE_BEATS),
  isCover: z.boolean(),
  index: z.number().int().min(0),
  title: z.string().trim().min(1),
  subhead: z.string().optional(),
  calloutBox: z.string().optional(),
  bullets: z.array(z.string()).optional(),
  checklist: z.array(z.string()).optional(),
  bottomAnchor: z.string().optional(),
  body: z.string().optional(),
  proofImageUri: z.string().optional(),
  slideComponent: z.enum(SLIDE_COMPONENTS).optional(),
  highlightWord: z.string().optional(),
  automationKeyword: KeywordSchema.optional(),
  ctaInstagramInstructions: z.string().optional(),
  ctaTiktokInstructions: z.string().optional(),
  // ── Layout directives (optional; renderer also defaults these) ──
  visualFocusIntent: z.string().optional(),
  forceContrastMode: z.enum(CONTRAST_MODES).optional(),
  showSwipeIndicator: z.boolean().optional(),
  paginationIndex: z.number().int().min(0).optional(),
})

export const CarouselBeatsSchema = z.array(CarouselBeatSchema).min(1)

// Validate already-mapped beats. Returns the typed array or null if the shape
// is unusable (caller falls back). Never throws.
export function validateCarouselBeats(beats: unknown): CarouselBeat[] | null {
  const result = CarouselBeatsSchema.safeParse(beats)
  if (!result.success) {
    console.warn('[carouselSchema] beat validation failed:', result.error.issues?.[0]?.message)
    return null
  }
  // A valid carousel must open on a hook cover.
  if (!result.data.some(b => b.beat === 'hook')) return null
  return result.data as CarouselBeat[]
}
