// EditorialPlan — the creative brief for a cover. Deterministic: a cover beat +
// resolved style → archetype + headline choreography + the asset prompts the
// AssetProvider must fulfil. Archetype-agnostic: routes through
// archetypes/registry.ts, the single source of style_id -> archetype truth.
// Per-archetype prompt authorship lives in archetypes/hero.ts / magazine.ts.
import type { ResolvedDesignSystem } from '@/lib/designSystem/resolveDesignSystem'
import type { CarouselBeat } from './types'
import type { TypographyToken } from './composeCover'
import { resolveArchetypeForStyle, getArchetypeModule } from './archetypes/registry'

export type CoverArchetype = 'hero' | 'magazine' // collage | split — deferred, registry slots reserved

export type EditorialPlan = {
  archetype: CoverArchetype
  headline: TypographyToken[]
  subjectPrompt: string
  bgPrompt: string
  overlapBand?: { topPct: number; bottomPct: number }
  handle?: string
}

export { headlineTokens } from './archetypes/hero'

export function planCover(
  beat: CarouselBeat,
  resolved: ResolvedDesignSystem,
  ctx: { topic: string; audience?: string | null; handle?: string }
): EditorialPlan | null {
  if (!beat.isCover) return null
  const archetype = resolveArchetypeForStyle(resolved.style_id)
  if (!archetype) return null
  const mod = getArchetypeModule(archetype)
  if (!mod) return null
  const p = mod.plan({ beat, resolved, ctx })
  return { archetype, ...p }
}
