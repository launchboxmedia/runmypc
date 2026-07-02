// Archetype interface — the seam between editorialPlan.ts (what to ask the
// image model for) and phaseOrchestrator.ts (how to turn the resulting
// assets into a rendered slide). Deliberately NOT `{layout, resolveAssets,
// validate}`: resolveAssets is already shared (assetProvider.ts's
// provideEditorialAssets is archetype-agnostic), and there is no separate
// "timeline" value anywhere in this codebase — every composer embeds the
// GSAP <script> inline in the HTML string it returns. Duplicating either
// would be dead code.
import type { ResolvedDesignSystem } from '@/lib/designSystem/resolveDesignSystem'
import type { CarouselBeat } from '../types'
import type { EditorialAssets, TypographyToken } from '../composeCover'
import type { CoverArchetype } from '../editorialPlan'

export type ArchetypePlanInput = {
  beat: CarouselBeat
  resolved: ResolvedDesignSystem
  ctx: { topic: string; audience?: string | null; handle?: string }
}

// What planCover needs from an archetype BEFORE assets exist: the headline
// choreography and the two image prompts. Same shape as EditorialPlan minus
// the `archetype` tag (the router adds that).
export type ArchetypePlan = {
  headline: TypographyToken[]
  subjectPrompt: string
  bgPrompt: string
  overlapBand?: { topPct: number; bottomPct: number }
  handle?: string
}

// What the archetype needs AFTER assets exist: compose the final slide HTML
// (GSAP timeline embedded inline, Hyperframes contract satisfied).
export type ArchetypeLayoutInput = {
  resolved: ResolvedDesignSystem
  headline: TypographyToken[]
  assets: EditorialAssets
  overlapBand?: { topPct: number; bottomPct: number }
  handle?: string
}

export type CoverArchetypeModule = {
  id: CoverArchetype
  plan(input: ArchetypePlanInput): ArchetypePlan
  layout(input: ArchetypeLayoutInput): string // full HTML document string
  // Optional gate: can this archetype actually render given the assets it
  // got back? Hero's "no subject → fall through to legacy cover" check is
  // archetype-specific policy (Magazine is fine with subject:null — a
  // background-only composition) — model it as a predicate, not a
  // hardcoded `if (assets.subject)` in the orchestrator.
  canRender?(assets: EditorialAssets): boolean
}
