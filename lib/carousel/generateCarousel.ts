// Phase C orchestrator. Takes pre-planned beats (from generateCarouselBeats),
// resolves the design system, resolves a cover visual, then for each beat
// generates animated GSAP HTML, quality-gates it with a static PNG check,
// and renders the final output as an animated MP4 via the Hyperframes service.
import { resolveDesignSystem, type ResolvedDesignSystem } from '@/lib/designSystem/resolveDesignSystem'
import { resolveCoverVisual } from './coverVisual'
import { generateSlideHtml, SLIDE_DURATION } from './slideHtml'
import { renderStaticPng, renderAnimatedSlide } from './renderClient'
import { checkSlide } from './qualityGate'
import { mapWithConcurrency } from './concurrency'
import type { CarouselBeat, CarouselSlideResult, GenerateCarouselResult } from './types'

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
  beats: CarouselBeat[]
  selectedAssetUrl?: string | null
  logoDataUri?: string | null
  resolved?: ResolvedDesignSystem
  onCoverVisualFailure?: (reason: string) => void
}): Promise<GenerateCarouselResult> {
  const { job, profile, beats, selectedAssetUrl } = input

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

  const handle = profile?.instagram_handle || undefined
  const logoDataUri = input.logoDataUri ?? null

  const coverBeat = beats.find(b => b.isCover)
  const bodyBeats = beats.filter(b => !b.isCover)

  // Kick off cover visual generation without awaiting so body beats render
  // in parallel while the image model works.
  const coverVisualPromise = resolveCoverVisual({
    resolved,
    topic: job.topic,
    audience: job.target_audience,
    selectedAssetUrl,
    onFailure: input.onCoverVisualFailure,
  })

  // Cover slide: wait for visual, then render.
  const coverPromise: Promise<CarouselSlideResult | null> = coverBeat
    ? coverVisualPromise.then(async cover => ({
        index: coverBeat.index,
        beat: coverBeat.beat,
        buffer: await renderBeatWithGate(coverBeat, resolved, cover?.dataUri ?? null, handle, logoDataUri),
      }))
    : Promise.resolve(null)

  // Body beats: render concurrently (bounded) — independent of cover visual.
  const bodyPromise = mapWithConcurrency(bodyBeats, SLIDE_CONCURRENCY, async beat => ({
    index: beat.index,
    beat: beat.beat,
    buffer: await renderBeatWithGate(beat, resolved, null, handle, logoDataUri),
  }))

  const [coverResult, bodyResults] = await Promise.all([coverPromise, bodyPromise])

  const slides = [...(coverResult ? [coverResult] : []), ...bodyResults].sort((a, b) => a.index - b.index)

  return { resolved, slides }
}

async function renderBeatWithGate(
  beat: CarouselBeat,
  resolved: ResolvedDesignSystem,
  coverVisualDataUri: string | null,
  handle: string | undefined,
  logoDataUri: string | null
): Promise<Buffer> {
  let retryNote: string | undefined
  let lastHtml = ''

  // HTML generation loop: quality-gate each attempt using a static PNG check.
  // Final attempt skips the gate and always proceeds to animated render.
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const html = await generateSlideHtml({
      resolved,
      beat,
      handle,
      coverVisualDataUri: beat.isCover ? coverVisualDataUri : null,
      logoDataUri,
      retryNote,
    })
    lastHtml = html

    if (attempt < MAX_RETRIES) {
      // Static PNG gate: faster than animated render, compatible with vision model.
      const gatePng = await renderStaticPng(html)
      const qa = await checkSlide(gatePng, beat)
      if (qa.pass) break
      retryNote = qa.issues
    }
  }

  // Final output: animated MP4 via Hyperframes.
  return renderAnimatedSlide(lastHtml, 1080, 1350, SLIDE_DURATION)
}
