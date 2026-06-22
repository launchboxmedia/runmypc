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
import { mapWithConcurrency } from './concurrency'
import type { CarouselSlideResult, GenerateCarouselResult, SlidePlan } from './types'

const MAX_RETRIES = 2
// Bounds concurrent Haiku + render calls per carousel against provider rate
// limits while still collapsing most of the serial slide latency.
const SLIDE_CONCURRENCY = 4

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
  // Optional brand logo (base64 data-URI) stamped on every slide as a mark.
  logoDataUri?: string | null
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
  const handle = profile?.instagram_handle || undefined

  // Kick off the slow cover-visual generation WITHOUT awaiting, so body slides
  // (which don't need it) render in parallel while the image model works.
  const coverVisualPromise = resolveCoverVisual({
    resolved,
    topic: job.topic,
    audience: job.target_audience,
    selectedAssetUrl,
  })

  const coverSlide = plan.find(s => s.isCover)
  const bodySlides = plan.filter(s => !s.isCover)
  const logoDataUri = input.logoDataUri ?? null

  // Cover slide: wait only for the cover visual, then render.
  const coverPromise: Promise<CarouselSlideResult | null> = coverSlide
    ? coverVisualPromise.then(async cover => ({
        index: coverSlide.index,
        beat: coverSlide.beat,
        png: await renderSlideWithGate(coverSlide, resolved, cover?.dataUri ?? null, handle, logoDataUri),
      }))
    : Promise.resolve(null)

  // Body slides: rendered concurrently (bounded) — independent of the cover visual.
  const bodyPromise = mapWithConcurrency(bodySlides, SLIDE_CONCURRENCY, async slide => ({
    index: slide.index,
    beat: slide.beat,
    png: await renderSlideWithGate(slide, resolved, null, handle, logoDataUri),
  }))

  const [coverResult, bodyResults] = await Promise.all([coverPromise, bodyPromise])

  const slides = [...(coverResult ? [coverResult] : []), ...bodyResults].sort((a, b) => a.index - b.index)

  return { resolved, slides }
}

async function renderSlideWithGate(
  slide: SlidePlan,
  resolved: GenerateCarouselResult['resolved'],
  coverVisualDataUri: string | null,
  handle: string | undefined,
  logoDataUri: string | null
): Promise<Buffer> {
  let retryNote: string | undefined
  let lastPng: Buffer | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const html = await generateSlideHtml({
      resolved,
      slide,
      handle,
      coverVisualDataUri: slide.isCover ? coverVisualDataUri : null,
      logoDataUri,
      retryNote,
    })
    const png = await renderStaticPng(html) // hard render error propagates → Step 4 marks failed
    lastPng = png

    // On the final allowed attempt the result is kept regardless, so skip the
    // (wasted) gate call. Earlier attempts gate and retry on failure.
    if (attempt === MAX_RETRIES) break
    const qa = await checkSlide(png, slide)
    if (qa.pass) break
    retryNote = qa.issues // regenerate with the failure note
  }

  return lastPng as Buffer
}
