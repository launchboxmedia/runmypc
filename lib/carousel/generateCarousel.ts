// Phase C orchestrator. Resolves the design system, plans slides from the IG
// post, resolves a cover visual, then for each slide generates HTML, renders a
// PNG via the static render service, and runs a quality gate with up to 2 retry
// regenerations. Returns ordered slide PNGs (cover first, single CTA last).
import { resolveDesignSystem, type ResolvedDesignSystem } from '@/lib/designSystem/resolveDesignSystem'
import { buildSlidePlan } from './buildSlidePlan'
import { resolveCoverVisual } from './coverVisual'
import { generateSlideHtml } from './slideHtml'
import { renderStaticPng } from './renderClient'
import { checkSlide } from './qualityGate'
import type { CarouselSlideResult, GenerateCarouselResult, SlidePlan } from './types'

const MAX_RETRIES = 2

type JobInput = {
  id: string
  topic: string
  target_audience?: string | null
  outcome?: string | null
  style_id?: string | null
  primary_color?: string | null
  split_image_cover?: boolean | null
}
type ProfileInput = {
  style_id?: string | null
  primary_color?: string | null
  split_image_cover?: boolean | null
  instagram_handle?: string | null
} | null

export async function generateCarousel(input: {
  job: JobInput
  profile: ProfileInput
  igPost: { hook: string; body: string; cta: string }
  selectedAssetUrl?: string | null
  // Phase D: pass a pre-resolved system so the carousel matches the rest of the
  // campaign (statics/cinematic) and we resolve once per job. Falls back to
  // resolving here if omitted.
  resolved?: ResolvedDesignSystem
}): Promise<GenerateCarouselResult> {
  const { job, profile, igPost, selectedAssetUrl } = input

  const resolved = input.resolved ?? await resolveDesignSystem({
    job: {
      style_id: job.style_id,
      primary_color: job.primary_color,
      split_image_cover: job.split_image_cover,
      topic: job.topic,
      target_audience: job.target_audience,
      outcome: job.outcome,
    },
    profile: profile
      ? { style_id: profile.style_id, primary_color: profile.primary_color, split_image_cover: profile.split_image_cover }
      : null,
  })

  const plan = buildSlidePlan(igPost)

  const cover = await resolveCoverVisual({
    resolved,
    topic: job.topic,
    audience: job.target_audience,
    selectedAssetUrl,
  })

  const handle = profile?.instagram_handle || undefined
  const slides: CarouselSlideResult[] = []

  for (const slide of plan) {
    const png = await renderSlideWithGate(slide, resolved, cover?.dataUri ?? null, handle)
    slides.push({ index: slide.index, beat: slide.beat, png })
  }

  return { resolved, slides }
}

async function renderSlideWithGate(
  slide: SlidePlan,
  resolved: GenerateCarouselResult['resolved'],
  coverVisualDataUri: string | null,
  handle: string | undefined
): Promise<Buffer> {
  let retryNote: string | undefined
  let lastPng: Buffer | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const html = await generateSlideHtml({
      resolved,
      slide,
      handle,
      coverVisualDataUri: slide.isCover ? coverVisualDataUri : null,
      retryNote,
    })
    const png = await renderStaticPng(html) // hard render error propagates → Step 4 marks failed
    lastPng = png

    const qa = await checkSlide(png, slide)
    if (qa.pass || attempt === MAX_RETRIES) break
    retryNote = qa.issues // regenerate with the failure note
  }

  return lastPng as Buffer
}
