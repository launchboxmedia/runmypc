// Phase 2 Orchestrator: Strategy Engine (OpenAI beats) + Visual Batch Engine
// (gpt-image-2 via Atlas Cloud) → Phase 1 CSS Grid layout (buildFallbackSlide).
//
// gpt-image-2 routes through Atlas Cloud (openai/gpt-image-2/text-to-image) —
// the existing generateImage() wrapper is already correct; no direct OpenAI
// SDK needed for images since Atlas Cloud handles the routing + polling.

import OpenAI from 'openai'
import { generateCarouselBeats, type BeatsDeps } from './generateCarouselBeats'
import { generateImage } from '@/lib/atlascloud'
import { buildFallbackSlide, stampLogo } from './slideHtml'
import { buildIgCtaSlide, buildTtCtaSlide } from './ctaKit'
import { STYLE_LIBRARY } from '@/lib/designSystem/styleLibrary'
import type { ResolvedDesignSystem } from '@/lib/designSystem/resolveDesignSystem'
import type { CarouselBeat } from './types'

// ── OpenAI client ──────────────────────────────────────────────────────────

function openaiClient(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

// ── Strategy Engine: OpenAI beat generation ────────────────────────────────
// Wraps generateCarouselBeats with an OpenAI-backed deps object.
const STRATEGY_MODEL = 'gpt-5.4-mini'

function buildOpenAIDeps(model = STRATEGY_MODEL): BeatsDeps {
  return {
    async generate(prompt) {
      const client = openaiClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await client.chat.completions.create({
        model: model as any,
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      })
      return res.choices[0]?.message.content ?? ''
    },
  }
}

export async function runStrategyEngine(
  topic: string,
  audience?: string,
  outcome?: string
): Promise<CarouselBeat[]> {
  return generateCarouselBeats(
    { topic, audience, outcome },
    buildOpenAIDeps()
  )
}

// ── Visual Batch Engine: Promise.all cover + body texture ──────────────────
// Both fire simultaneously via Atlas Cloud (openai/gpt-image-2/text-to-image).

const IMAGE_MODEL = 'openai/gpt-image-2/text-to-image'

export type VisualBatchResult = {
  coverUrl: string
  bodyTextureUrl: string
}

export async function runVisualBatch(
  topic: string,
  styleId: string = 'premium_editorial'
): Promise<VisualBatchResult> {
  const style = STYLE_LIBRARY[styleId as keyof typeof STYLE_LIBRARY]

  const coverPrompt = [
    `Cinematic, text-free, full-bleed social media carousel cover image about "${topic}".`,
    style ? `Visual style: ${style.hook_technique}.` : '',
    'No text, no words, no letters, no watermarks. Photographic or illustrative.',
    'Portrait 4:5 framing. Scroll-stopping. Leave negative space at bottom for headline overlay.',
  ].filter(Boolean).join(' ')

  const texturePrompt = [
    `Subtle, abstract, text-free background texture. Muted tones matching a ${style?.display_name || 'premium editorial'} design aesthetic.`,
    'Very low contrast — functions as a repeating background, not a focal image.',
    'No text, no symbols, no recognizable objects. Pure texture. Square crop.',
  ].filter(Boolean).join(' ')

  const [coverResult, textureResult] = await Promise.all([
    generateImage({ prompt: coverPrompt, model: IMAGE_MODEL }),
    generateImage({ prompt: texturePrompt, model: IMAGE_MODEL }),
  ])

  return {
    coverUrl: coverResult.url,
    bodyTextureUrl: textureResult.url,
  }
}

// ── Proof URI substitution ─────────────────────────────────────────────────
// When the strategy engine returns proofImageUri:"mock_asset_required",
// inject a placeholder so .premium-proof-frame renders on the dynamic run.

const PROOF_PLACEHOLDER_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="420">
  <rect width="800" height="420" fill="#e8f4f8" rx="8"/>
  <rect x="40" y="40" width="720" height="340" fill="white" rx="6"/>
  <text x="400" y="200" font-family="sans-serif" font-size="32" fill="#4a90d9"
        text-anchor="middle" dominant-baseline="middle">Proof Asset — Dynamic Slot</text>
  <text x="400" y="255" font-family="sans-serif" font-size="22" fill="#888"
        text-anchor="middle">proofImageUri resolved at runtime</text>
</svg>`)}`

// proofOverrides: map of beat index → real image URL (from user uploads).
// Real uploads replace any LLM-generated proofImageUri (including sentinel).
// Sentinel 'mock_asset_required' without override → placeholder SVG.
function substituteProofUris(
  beats: CarouselBeat[],
  proofOverrides?: Record<number, string>
): CarouselBeat[] {
  return beats.map(b => {
    const override = proofOverrides?.[b.index]
    if (override) return { ...b, proofImageUri: override }
    if (b.proofImageUri === 'mock_asset_required') return { ...b, proofImageUri: PROOF_PLACEHOLDER_SVG }
    return b
  })
}

// ── Orchestrator bridge ────────────────────────────────────────────────────
// Calls Strategy Engine + Visual Batch, feeds into Phase 1 HTML builder.

export type CtaMeta = {
  keyword: string
  igIndex: number   // index in slideHtml[] of the IG CTA slide
  ttIndex: number   // index in slideHtml[] of the TikTok CTA slide
}

export type OrchestratorResult = {
  resolved: ResolvedDesignSystem
  beats: CarouselBeat[]
  visualBatch: VisualBatchResult
  slideHtml: string[]   // body slides + [n-1]=IG CTA + [n]=TikTok CTA
  ctaMeta?: CtaMeta
}

// ── Production compiler (replaces generateCarousel) ───────────────────────
// Takes pre-generated beats + resolved design system → slideHtml[] + ctaMeta.
// Caller is responsible for rendering each HTML to MP4 via renderAnimatedSlide.

export type CompileCarouselInput = {
  beats: CarouselBeat[]
  resolved: ResolvedDesignSystem
  topic: string
  selectedAssetUrl?: string | null
  logoDataUri?: string | null
  proofAssets?: Record<number, string>  // beat index → real uploaded image URL
  proofAssetUrl?: string | null         // single uploaded proof URL (auto-mapped to first proof beat)
  onCoverVisualFailure?: (reason: string) => void
}

export type CompileCarouselResult = {
  slideHtml: string[]
  ctaMeta?: CtaMeta
  visualBatch: VisualBatchResult
}

async function fetchAsDataUri(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch failed (${res.status}): ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const ct = res.headers.get('content-type') || 'image/jpeg'
  return `data:${ct};base64,${buf.toString('base64')}`
}

export async function compileCarousel(input: CompileCarouselInput): Promise<CompileCarouselResult> {
  const { beats, resolved, topic, selectedAssetUrl, logoDataUri, proofAssets, proofAssetUrl, onCoverVisualFailure } = input

  // Auto-map proofAssetUrl → proofAssets on the first beat flagged as proof
  const resolvedProofAssets: Record<number, string> | undefined = (() => {
    if (!proofAssetUrl) return proofAssets
    const proofBeat = beats.find(b => b.proofImageUri === 'mock_asset_required')
    if (!proofBeat) return proofAssets
    return { ...(proofAssets ?? {}), [proofBeat.index]: proofAssetUrl }
  })()

  // 1. Visual batch + proof substitution in parallel
  const [visualBatch, processedBeats] = await Promise.all([
    runVisualBatch(topic, resolved.style_id),
    Promise.resolve(substituteProofUris(beats, resolvedProofAssets)),
  ])

  // 2. Fetch cover + body texture as data-URIs (render lambda has no network egress)
  const [coverDataUri, textureDataUri] = await Promise.allSettled([
    fetchAsDataUri(selectedAssetUrl || visualBatch.coverUrl).catch(async () => {
      // Fall through to generated cover if selected asset fails
      return fetchAsDataUri(visualBatch.coverUrl)
    }),
    fetchAsDataUri(visualBatch.bodyTextureUrl),
  ]).then(([cover, tex]) => [
    cover.status === 'fulfilled' ? cover.value : (onCoverVisualFailure?.('cover fetch failed'), null),
    tex.status === 'fulfilled' ? tex.value : null,
  ])

  // 3. Separate CTA from body beats
  const ctaBeat = processedBeats.find(b => b.beat === 'cta')
  const bodyBeats = processedBeats.filter(b => b.beat !== 'cta')

  // 4. Compile body beats → HTML (CSS Grid engine)
  const bodyHtml = bodyBeats.map((beat, i) => {
    let html = buildFallbackSlide(beat, resolved, {
      bodyTextureUri: i > 0 && textureDataUri ? textureDataUri : undefined,
    })
    if (i === 0 && coverDataUri) {
      html = html.replaceAll('__COVER_VISUAL__', coverDataUri)
    }
    if (logoDataUri) html = stampLogo(html, logoDataUri)
    return html
  })

  // 5. Render CTA beat twice — IG + TikTok
  const igHtml = ctaBeat ? buildIgCtaSlide(ctaBeat) : null
  const ttHtml = ctaBeat ? buildTtCtaSlide(ctaBeat) : null

  const slideHtml = [...bodyHtml, ...(igHtml ? [igHtml] : []), ...(ttHtml ? [ttHtml] : [])]

  const ctaMeta: CtaMeta | undefined = ctaBeat ? {
    keyword: ctaBeat.automationKeyword || '',
    igIndex: bodyHtml.length,
    ttIndex: bodyHtml.length + 1,
  } : undefined

  return { slideHtml, ctaMeta, visualBatch }
}

export async function runOrchestrator(
  topic: string,
  resolved: ResolvedDesignSystem
): Promise<OrchestratorResult> {
  // 1. Beat generation (OpenAI) + image batch (Atlas Cloud gpt-image-2) in parallel
  const [rawBeats, visualBatch] = await Promise.all([
    runStrategyEngine(topic),
    runVisualBatch(topic, resolved.style_id),
  ])

  // 2. Substitute mock proof URIs → placeholder
  const beats = substituteProofUris(rawBeats)

  // 3. Fetch cover image as data-URI (render lambda needs embedded image)
  const coverRes = await fetch(visualBatch.coverUrl)
  const coverBuf = Buffer.from(await coverRes.arrayBuffer())
  const coverDataUri = `data:image/jpeg;base64,${coverBuf.toString('base64')}`

  // 4. Separate CTA beat — rendered twice as platform-specific slides
  const ctaBeat = beats.find(b => b.beat === 'cta')
  const bodyBeats = beats.filter(b => b.beat !== 'cta')

  // 5. Compile body beats → HTML via Phase 1 CSS Grid layout
  const bodyHtml = bodyBeats.map(beat => buildFallbackSlide(beat, resolved))

  // 6. Inject cover visual into cover slide
  if (bodyHtml[0]) {
    bodyHtml[0] = bodyHtml[0].replaceAll('__COVER_VISUAL__', coverDataUri)
  }

  // 7. Render CTA beat as IG + TikTok slides (modular CTA kit)
  const igHtml = ctaBeat ? buildIgCtaSlide(ctaBeat) : null
  const ttHtml = ctaBeat ? buildTtCtaSlide(ctaBeat) : null

  const slideHtml = [
    ...bodyHtml,
    ...(igHtml ? [igHtml] : []),
    ...(ttHtml ? [ttHtml] : []),
  ]

  const ctaMeta: CtaMeta | undefined = ctaBeat ? {
    keyword: ctaBeat.automationKeyword || '',
    igIndex: bodyHtml.length,
    ttIndex: bodyHtml.length + 1,
  } : undefined

  return { resolved, beats, visualBatch, slideHtml, ctaMeta }
}

// ── Test runner (mock data — no API calls) ─────────────────────────────────
// Uses hardcoded beats + inline SVG placeholders for Playwright verification.
// Proves the API routing hydrates the Phase 1 mold without burning credits.

export function runOrchestratorMock(resolved: ResolvedDesignSystem): {
  beats: CarouselBeat[]
  slideHtml: string[]   // body + IG CTA + TikTok CTA
  ctaMeta: CtaMeta
} {
  const mockCoverSvg = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="742">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#1a1a2e"/>
    <stop offset="60%" stop-color="#16213e"/>
    <stop offset="100%" stop-color="#0f3460"/>
  </linearGradient></defs>
  <rect width="1080" height="742" fill="url(#g)"/>
  <text x="540" y="350" font-family="sans-serif" font-size="40" fill="rgba(255,255,255,0.2)"
        text-anchor="middle">gpt-image-2 COVER — "Why DIY credit repair letters fail"</text>
</svg>`)}`

  const rawBeats: CarouselBeat[] = [
    {
      beat: 'hook', isCover: true, index: 0,
      title: 'Why DIY Credit Repair Letters Fail',
      subhead: 'Most people miss this one critical detail',
    },
    {
      beat: 'problem', isCover: false, index: 1,
      title: 'Generic Templates Get Ignored',
      subhead: 'Credit bureaus auto-reject anything that looks templated',
      bullets: ['Pattern-matched by automated scanners', 'Zero legal standing', 'Wastes 30–60 day dispute window'],
    },
    {
      beat: 'value', isCover: false, index: 2,
      title: 'Customized Letters Win Every Time',
      calloutBox: 'Specific = credible. Credible = investigated.',
      proofImageUri: 'mock_asset_required',  // triggers .premium-proof-frame
    },
    {
      beat: 'payoff', isCover: false, index: 3,
      title: 'Client: 94-Point Jump in 60 Days',
      subhead: 'Using our custom letter system',
      bottomAnchor: 'Real results, documented.',
    },
    {
      beat: 'cta', isCover: false, index: 4,
      title: 'Stop Wasting Dispute Rounds',
      slideComponent: 'cta',
      automationKeyword: 'CREDIT FIX',
      ctaInstagramInstructions: 'Comment "CREDIT FIX" below — I\'ll DM you our complete dispute letter system instantly.',
      ctaTiktokInstructions: 'DM me "CREDIT FIX" right now and I\'ll send you the complete system immediately.',
    },
  ]

  const beats = substituteProofUris(rawBeats)

  // Force opacity:1 for visual test — GSAP starts at 0 (correct for Hyperframes)
  // but Playwright screenshots at t=0 so we need a static override.
  const visibilityOverride = `<style id="test-vis-override">
    *{opacity:1!important;transform:none!important}
    #cover-bg{transform:scale(1)!important}
  </style>`

  const ctaBeat = beats.find(b => b.beat === 'cta')
  const bodyBeats = beats.filter(b => b.beat !== 'cta')

  const bodyHtml = bodyBeats.map((beat, i) => {
    let html = buildFallbackSlide(beat, resolved)
    if (i === 0) {
      html = html.replaceAll('__COVER_VISUAL__', mockCoverSvg)
    }
    // Inject override before </head>
    html = html.replace('</head>', visibilityOverride + '</head>')
    return html
  })

  // Render CTA beat twice — IG then TikTok — with visibility override
  const igHtml = ctaBeat
    ? buildIgCtaSlide(ctaBeat).replace('</head>', visibilityOverride + '</head>')
    : null
  const ttHtml = ctaBeat
    ? buildTtCtaSlide(ctaBeat).replace('</head>', visibilityOverride + '</head>')
    : null

  const slideHtml = [
    ...bodyHtml,
    ...(igHtml ? [igHtml] : []),
    ...(ttHtml ? [ttHtml] : []),
  ]

  const ctaMeta: CtaMeta = {
    keyword: ctaBeat?.automationKeyword || '',
    igIndex: bodyHtml.length,
    ttIndex: bodyHtml.length + 1,
  }

  return { beats, slideHtml, ctaMeta }
}
