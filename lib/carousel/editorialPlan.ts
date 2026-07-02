// EditorialPlan — the creative brief for a cover. Deterministic: a cover beat +
// resolved style → archetype + headline choreography + the asset prompts the
// AssetProvider must fulfil. Named EditorialPlan (not CoverPlan) so body slides
// can share it later. RULE: every field here is consumed by composeCover or the
// AssetProvider — no dead direction.
//
// v1 implements the Hero archetype only and routes ONLY the styles whose
// benchmark cover is a type+cutout-subject Hero. Other styles return null →
// caller keeps the legacy flat-image cover until their archetype ships.
import { STYLE_LIBRARY } from '@/lib/designSystem/styleLibrary'
import type { ResolvedDesignSystem } from '@/lib/designSystem/resolveDesignSystem'
import type { CarouselBeat } from './types'
import type { TypographyToken } from './composeCover'

export type CoverArchetype = 'hero' // type_dominant | magazine | collage | split — deferred

export type EditorialPlan = {
  archetype: CoverArchetype
  headline: TypographyToken[]
  subjectPrompt: string
  bgPrompt: string
  overlapBand?: { topPct: number; bottomPct: number }
  handle?: string
}

// Styles whose benchmark cover is a Hero (type + cutout subject). Grow this set
// as archetypes ship; keep it the single source of routing truth.
const HERO_STYLES = new Set<ResolvedDesignSystem['style_id']>(['bold_personal'])

const PERSONAL_RE = /\b(personal|fitness|wellness|weight|transformation|consumer|self|body|health|motivation|confidence|diet|mindset)\b/i

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/gi, '')

// Title → tokens: one xl word per line (Hero rhythm), highlight word painted
// accent. Tier-1 choreography only (no fit-driven condensation / optical
// balancing — those are deferred Tier-2 fields).
export function headlineTokens(title: string, highlightWord?: string): TypographyToken[] {
  const words = title.trim().split(/\s+/).filter(Boolean)
  const hw = highlightWord ? norm(highlightWord) : ''
  return words.map((w, i) => ({
    text: w,
    scale: 'xl' as const,
    color: hw && norm(w) === hw ? ('accent' as const) : ('fg' as const),
    break: i < words.length - 1,
  }))
}

export function planCover(
  beat: CarouselBeat,
  resolved: ResolvedDesignSystem,
  ctx: { topic: string; audience?: string | null; handle?: string }
): EditorialPlan | null {
  if (!beat.isCover) return null
  if (!HERO_STYLES.has(resolved.style_id)) return null
  const style = STYLE_LIBRARY[resolved.style_id]
  const personal = PERSONAL_RE.test(ctx.audience || '')

  const subjectPrompt = [
    'Photograph containing absolutely no text, letters, words, captions, or logos anywhere in frame.',
    `Full-body studio photograph of a single person for a social media cover about ${ctx.topic}.`,
    personal
      ? 'Relatable everyday person, direct eye contact, genuine emotional expression.'
      : 'Confident expert, direct eye contact.',
    `Pose/gesture in the spirit of: ${style.hook_technique}.`,
    'Restrained editorial pose: arms close to the body or crossed, hands resting near pockets or clothing, calm vertical silhouette.',
    'Avoid stop gestures, pointing, hands reaching toward the camera, or any raised arm/limb crossing the upper body or face.',
    'Isolated subject only, completely transparent background, sharp clean cut-out edges, cinematic rim lighting, centered, head to knees visible.',
  ].join(' ')

  const bgPrompt = [
    'Image containing absolutely no text, letters, words, captions, or logos anywhere in frame.',
    `Moody atmospheric editorial backdrop for a cover about ${ctx.topic}.`,
    'Abstract, no people, no objects, cinematic, soft vignette, dark tones with a subtle warm rim glow, portrait orientation.',
  ].join(' ')

  return {
    archetype: 'hero',
    headline: headlineTokens(beat.title, beat.highlightWord),
    subjectPrompt,
    bgPrompt,
    handle: ctx.handle,
  }
}
