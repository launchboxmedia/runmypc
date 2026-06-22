// Turn a resolved design system into a compact natural-language fragment for
// embedding in image/video generation prompts (static creatives, cinematic
// hero). Pure, deterministic, never throws — style_id is a validated StyleId.
import { STYLE_LIBRARY } from './styleLibrary'
import type { ResolvedDesignSystem } from './resolveDesignSystem'

export function describeDesignSystem(resolved: ResolvedDesignSystem): string {
  const s = STYLE_LIBRARY[resolved.style_id]
  return [
    `Visual style: ${s.display_name} — ${s.typography.treatment}.`,
    `Aesthetic: ${s.hook_technique}`,
    `Color palette: background ${resolved.background}, primary ${resolved.primary_color}, accent ${resolved.accent}. Use these colors as the dominant palette.`,
  ].join(' ')
}
