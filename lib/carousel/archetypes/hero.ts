// Hero archetype — thin adapter over the frozen v1 pipeline (composeCover.ts
// / coverResolver.ts), plus Hero's prompt authorship (moved here from
// editorialPlan.ts so editorialPlan.ts stays archetype-agnostic). Does not
// change Hero's behavior; only wires it into the archetype registry so the
// orchestrator can dispatch generically. See docs/adr/ADR-0001-hero-archetype-v1.md.
import { STYLE_LIBRARY } from '@/lib/designSystem/styleLibrary'
import { composeCover } from '../composeCover'
import { resolveCoverGeometry } from '../coverResolver'
import type { TypographyToken } from '../composeCover'
import type { ArchetypePlanInput, ArchetypePlan, ArchetypeLayoutInput, CoverArchetypeModule } from './types'

const PERSONAL_RE = /\b(personal|fitness|wellness|weight|transformation|consumer|self|body|health|motivation|confidence|diet|mindset)\b/i
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/gi, '')

// Title → tokens: one xl word per line (Hero rhythm), highlight word painted
// accent. Tier-1 choreography only — verbatim from editorialPlan.ts.
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

function buildHeroPlan(input: ArchetypePlanInput): ArchetypePlan {
  const { beat, resolved, ctx } = input
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

  return { headline: headlineTokens(beat.title, beat.highlightWord), subjectPrompt, bgPrompt, handle: ctx.handle }
}

export const heroArchetype: CoverArchetypeModule = {
  id: 'hero',
  plan: buildHeroPlan,
  canRender: (assets) => Boolean(assets.subject),
  layout: ({ resolved, headline, assets, overlapBand, handle }: ArchetypeLayoutInput) => {
    const geometry = overlapBand
      ? ({ layoutMode: 'overlap', overlapBand } as const)
      : resolveCoverGeometry(assets.subject)
    // ponytail: the old inline dispatch block logged
    // onCoverVisualFailure(`stacked-layout-used: ${geometry.reason}`) here —
    // dropped since geometry is now internal to this module and no consumer
    // branches on that message (confirmed: content-generation.ts just logs
    // it verbatim). Add an optional describeRender? hook to
    // CoverArchetypeModule if this telemetry turns out to matter later.
    return composeCover({ resolved, headline, assets, ...geometry, handle })
  },
}
