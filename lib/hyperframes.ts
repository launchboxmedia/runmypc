// Hyperframes Social Video Generation — agent-driven compositions.
//
// For each social post we ask an LLM (Claude Haiku) to write a self-contained
// HTML/CSS/JS motion-graphics composition, then POST that HTML to a deployed
// Hyperframes render service (HYPERFRAMES_RENDER_URL). The service renders the
// composition to MP4 in a Vercel Sandbox (Chromium + FFmpeg) and returns a
// public MP4 URL.
//
// There is NO brand identity here. Every job is a customer job. Compositions
// use safe, niche-neutral defaults (dark background, bold typography, high
// contrast) and embed the customer's own business assets when available.
//
// Deploy reference for the render service: see hyperframes-service/README.md.
// If HYPERFRAMES_RENDER_URL is unset, callers should skip social video.

import Anthropic from '@anthropic-ai/sdk'

let anthropic: Anthropic
function getAnthropic(): Anthropic {
  if (!anthropic) anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return anthropic
}

const COMPOSITION_MODEL = 'claude-haiku-4-5-20251001'

// 9:16 vertical for IG Reels + TikTok.
const VIDEO_WIDTH = 1080
const VIDEO_HEIGHT = 1920
const VIDEO_FPS = 30
const VIDEO_DURATION_SECONDS = 12

export type SocialPostInput = {
  platform: string
  hook: string
  body: string
  cta: string
}

export type BusinessAsset = {
  id: string
  file_path: string
  file_type: string
  usable_in: 'static' | 'video' | 'both'
}

export type SocialVideoResult = {
  platform: string
  postIndex: number
  mp4Url: string
}

export function isHyperframesConfigured(): boolean {
  return Boolean(process.env.HYPERFRAMES_RENDER_URL)
}

// Ask the LLM to write a complete, self-contained motion-graphics composition.
async function generateCompositionHtml(
  post: SocialPostInput,
  assetUrls: string[]
): Promise<string> {
  const assetBlock = assetUrls.length
    ? `Customer brand assets you MAY embed (logo / product images). Use them tastefully as accents, backgrounds at low opacity, or a logo lockup. Do NOT distort them:\n${assetUrls.map((u, i) => `  ASSET_${i + 1}: ${u}`).join('\n')}`
    : `No brand assets provided. Use text + motion graphics only.`

  const system = `You are a motion-graphics engineer. You output ONE complete, self-contained HTML document that renders a short social-media video composition. The document is rendered to MP4 by a headless Chromium screen recorder, so EVERYTHING must be inline.

HARD REQUIREMENTS:
- Output ONLY the HTML document. No markdown fences, no commentary, no explanation.
- Canvas is exactly ${VIDEO_WIDTH}x${VIDEO_HEIGHT} px (9:16 vertical). The <body> must be exactly that size, no scrollbars, overflow hidden.
- Total animation runs ~${VIDEO_DURATION_SECONDS}s then holds on a CTA end card. Use CSS @keyframes / animation-delay for all timing. No JS timers required, but inline JS is allowed.
- NO external resources except the asset image URLs explicitly provided. No web fonts, no CDNs, no <link>, no external <script>. Use system font stacks.
- Dark background, high contrast, bold kinetic typography. Reveal the HOOK first (big), then supporting BODY, then a CTA end card. Think scroll-stopping reel, not slideshow.
- Silent. No audio elements.
- Looks good for ANY niche — no assumptions about industry.`

  const user = `Write the composition for this ${post.platform} post.

HOOK: ${post.hook}
BODY: ${post.body}
CTA: ${post.cta}

${assetBlock}

Return the full HTML document now.`

  const res = await getAnthropic().messages.create({
    model: COMPOSITION_MODEL,
    max_tokens: 4096,
    system,
    messages: [{ role: 'user', content: user }]
  })

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')

  return stripCodeFences(text).trim()
}

// LLMs sometimes wrap output in ```html fences despite instructions.
function stripCodeFences(s: string): string {
  const fenceMatch = s.match(/```(?:html)?\s*([\s\S]*?)```/i)
  if (fenceMatch) return fenceMatch[1]
  return s
}

// POST the composition HTML to the deployed Hyperframes render service.
async function renderComposition(html: string): Promise<string> {
  const url = process.env.HYPERFRAMES_RENDER_URL
  if (!url) throw new Error('HYPERFRAMES_RENDER_URL not configured')

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      html,
      width: VIDEO_WIDTH,
      height: VIDEO_HEIGHT,
      fps: VIDEO_FPS,
      durationInSeconds: VIDEO_DURATION_SECONDS
    })
  })

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`Hyperframes render failed (${res.status}): ${err.slice(0, 300)}`)
  }

  const data = (await res.json()) as { url?: string; error?: string }
  if (!data.url) throw new Error(`Hyperframes render returned no url: ${data.error || 'unknown'}`)
  return data.url
}

// Generate one social video per post. Works with zero business assets.
export async function generateAllSocialVideos(specs: {
  posts: SocialPostInput[]
  businessAssets?: BusinessAsset[]
}): Promise<SocialVideoResult[]> {
  const { posts, businessAssets = [] } = specs

  const assetUrls = businessAssets
    .filter(a => a && (a.usable_in === 'video' || a.usable_in === 'both'))
    .map(a => a.file_path)
    .filter(Boolean)
    .slice(0, 2)

  const results: SocialVideoResult[] = []

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i]
    try {
      const html = await generateCompositionHtml(post, assetUrls)
      const mp4Url = await renderComposition(html)
      results.push({ platform: post.platform, postIndex: i, mp4Url })
    } catch (err) {
      console.error(`[Hyperframes] post ${i} (${post.platform}) failed:`, err)
    }
  }

  return results
}
