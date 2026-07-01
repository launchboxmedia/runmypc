// Resolve the carousel design system for a job. READ-ONLY: this module performs
// ZERO database writes. It reads plain inputs and returns a value. There is no
// profile-write path here to forget about. Persisting a resolved system is the
// sole job of persistJobStyle (jobs table only).
//
// Style order:  job override -> profile default -> Haiku classification.
// Color order:  job primary  -> profile primary  -> style implied_tone.
// Haiku results are job-scoped (source: 'haiku_inferred') and must NEVER be
// written back to the profile.

import Anthropic from '@anthropic-ai/sdk'
import { STYLE_LIBRARY, type StyleId, type Palette } from './styleLibrary'
import { derivePalette } from './colorDerivation'

export type DesignSystemSource = 'job_override' | 'profile_default' | 'haiku_inferred'

export type ResolvedDesignSystem = {
  style_id: StyleId
  source: DesignSystemSource
  primary_color: string
  accent: string
  background: string
  split_image_cover: boolean
}

export type ClassifyInput = { topic: string; target_audience?: string | null; outcome?: string | null }
export type ResolveDeps = { classifyStyle: (input: ClassifyInput) => Promise<StyleId> }

type JobInput = {
  style_id?: string | null
  primary_color?: string | null
  split_image_cover?: boolean | null
  topic: string
  target_audience?: string | null
  outcome?: string | null
}
type ProfileInput = {
  style_id?: string | null
  primary_color?: string | null
  split_image_cover?: boolean | null
} | null

const VALID_IDS: StyleId[] = ['bold_personal', 'clean_direct', 'warm_handmade', 'sharp_professional', 'premium_editorial']
function asStyleId(v: unknown): StyleId | null {
  return typeof v === 'string' && (VALID_IDS as string[]).includes(v) ? (v as StyleId) : null
}

let _anthropic: Anthropic
function anthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _anthropic
}

// Default classifier — a single Haiku call mirroring the Step-0 niche
// classification in content-generation.ts. Never throws; defaults to a safe
// style on any failure.
export async function classifyStyle(input: ClassifyInput): Promise<StyleId> {
  try {
    const res = await anthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 50,
      messages: [{
        role: 'user',
        content: `Classify this content into ONE carousel design style id.

Topic: ${input.topic}
Audience: ${input.target_audience || ''}
Outcome: ${input.outcome || ''}

Options (pick the best fit):
- bold_personal: huge type, a person facing the reader, punchy and personal
- clean_direct: crisp comparisons, single clear focal point, minimal
- warm_handmade: tactile collage, handwritten feel, personal/cozy
- sharp_professional: structured educational walkthroughs, rigid grids
- premium_editorial: magazine-grade, cinematic, or native-feed camouflage

Respond with ONLY the id, nothing else.`,
      }],
    })
    const text = res.content[0]?.type === 'text' ? res.content[0].text.trim() : ''
    return asStyleId(text) ?? 'clean_direct'
  } catch {
    return 'clean_direct'
  }
}

export async function resolveDesignSystem(
  input: { job: JobInput; profile: ProfileInput },
  deps: ResolveDeps = { classifyStyle }
): Promise<ResolvedDesignSystem> {
  const { job, profile } = input

  // Style
  let style_id: StyleId
  let source: DesignSystemSource
  const jobStyle = asStyleId(job.style_id)
  const profileStyle = asStyleId(profile?.style_id)
  if (jobStyle) {
    style_id = jobStyle
    source = 'job_override'
  } else if (profileStyle) {
    style_id = profileStyle
    source = 'profile_default'
  } else {
    style_id = await deps.classifyStyle({ topic: job.topic, target_audience: job.target_audience, outcome: job.outcome })
    source = 'haiku_inferred'
  }

  // Color
  const primary = job.primary_color || profile?.primary_color || null
  const palette: Palette = primary ? derivePalette(style_id, primary) : STYLE_LIBRARY[style_id].implied_tone

  // Split-image flag — style preset is the fallback; job/profile can still override
  const styleDefault = STYLE_LIBRARY[style_id].default_split_cover
  const split_image_cover = (job.split_image_cover ?? profile?.split_image_cover ?? styleDefault) === true

  return {
    style_id,
    source,
    primary_color: palette.primary,
    accent: palette.accent,
    background: palette.background,
    split_image_cover,
  }
}
