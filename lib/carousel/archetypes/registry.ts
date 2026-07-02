import type { StyleId } from '@/lib/designSystem/styleLibrary'
import type { CoverArchetype } from '../editorialPlan'
import { heroArchetype } from './hero'
import { magazineArchetype } from './magazine'
import type { CoverArchetypeModule } from './types'

// Single source of routing truth: style_id -> archetype. Route by style_id
// (generalizing the old HERO_STYLES set) — CarouselBeat carries no
// category/tone signal to route on otherwise.
const STYLE_ARCHETYPE: Record<StyleId, CoverArchetype | null> = {
  bold_personal: 'hero',
  premium_editorial: 'magazine',
  clean_direct: null,       // legacy fallback (buildFallbackSlide) — unchanged
  warm_handmade: null,      // legacy fallback — unchanged
  sharp_professional: null, // legacy fallback — unchanged
}

export function resolveArchetypeForStyle(styleId: StyleId): CoverArchetype | null {
  return STYLE_ARCHETYPE[styleId] ?? null
}

const REGISTRY: Partial<Record<CoverArchetype, CoverArchetypeModule>> = {
  hero: heroArchetype,
  magazine: magazineArchetype,
  // split / collage: reserved for later, not implemented in this pass.
}

export function getArchetypeModule(archetype: CoverArchetype): CoverArchetypeModule | null {
  return REGISTRY[archetype] ?? null
}
