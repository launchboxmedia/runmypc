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

// Hyperframes does NOT screen-record CSS animations. The renderer SEEKS a
// paused GSAP timeline registered at window.__timelines[COMPOSITION_ID], frame
// by frame, against the root element's data-duration. All motion MUST be driven
// by that GSAP timeline (CSS @keyframes/transitions are not seeked → frozen).
const COMPOSITION_ID = 'scene'
const GSAP_CDN = 'https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js'

function esc(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Deterministic, always-valid hyperframes composition. Used directly as a
// fallback and given to the LLM as the contract to follow. Brand-neutral.
function buildFallbackComposition(post: SocialPostInput, assetUrls: string[]): string {
  const logo = assetUrls[0]
    ? `<img id="logo" src="${esc(assetUrls[0])}" alt="" />`
    : ''
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${VIDEO_WIDTH}, height=${VIDEO_HEIGHT}">
<script src="${GSAP_CDN}"></script>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${VIDEO_WIDTH}px;height:${VIDEO_HEIGHT}px;overflow:hidden;background:#0B0B0F}
  #${COMPOSITION_ID}{position:relative;width:${VIDEO_WIDTH}px;height:${VIDEO_HEIGHT}px;background:radial-gradient(120% 90% at 50% 0%,#16161f 0%,#0B0B0F 60%);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif;color:#fff;overflow:hidden}
  #logo{position:absolute;top:120px;left:50%;transform:translateX(-50%);max-width:280px;max-height:160px;object-fit:contain;opacity:0}
  #hook{position:absolute;top:560px;left:90px;right:90px;font-size:92px;font-weight:900;line-height:1.04;letter-spacing:-1px;opacity:0}
  #body{position:absolute;top:1020px;left:90px;right:90px;font-size:46px;font-weight:500;line-height:1.35;color:#cfd0d8;opacity:0}
  #cta{position:absolute;bottom:300px;left:50%;transform:translateX(-50%);padding:34px 70px;background:#fff;color:#0B0B0F;font-size:48px;font-weight:800;border-radius:70px;white-space:nowrap;opacity:0}
  #bar{position:absolute;bottom:220px;left:90px;height:8px;width:0;background:#fff;border-radius:8px;opacity:.85}
</style>
</head>
<body>
<div id="${COMPOSITION_ID}" data-composition-id="${COMPOSITION_ID}" data-width="${VIDEO_WIDTH}" data-height="${VIDEO_HEIGHT}" data-start="0" data-duration="${VIDEO_DURATION_SECONDS}" data-root="true">
  ${logo}
  <div id="hook">${esc(post.hook)}</div>
  <div id="body">${esc(post.body)}</div>
  <div id="cta">${esc(post.cta || 'Learn more')}</div>
  <div id="bar"></div>
</div>
<script>
  window.__timelines = window.__timelines || {};
  var tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });
  ${assetUrls[0] ? `tl.fromTo("#logo",{opacity:0},{opacity:1,duration:0.6},0.2);` : ''}
  tl.fromTo("#hook",{opacity:0,y:60},{opacity:1,y:0,duration:1.0},0.4);
  tl.fromTo("#body",{opacity:0,y:40},{opacity:1,y:0,duration:0.9},3.6);
  tl.fromTo("#bar",{width:0},{width:${VIDEO_WIDTH - 180},duration:6.0,ease:"none"},2.0);
  tl.fromTo("#cta",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:0.7,ease:"back.out(1.7)"},7.4);
  tl.to("#cta",{scale:1.06,duration:0.5,yoyo:true,repeat:2},8.4);
  // Hold to full duration so the timeline length matches data-duration.
  tl.to("#${COMPOSITION_ID}",{opacity:1,duration:0.01},${VIDEO_DURATION_SECONDS});
  window.__timelines["${COMPOSITION_ID}"] = tl;
</script>
</body>
</html>`
}

// A composition must drive motion via a seekable GSAP timeline registered on
// window.__timelines, or the rendered MP4 is a frozen frame.
function isValidComposition(html: string): boolean {
  return (
    html.includes('data-root="true"') &&
    html.includes('window.__timelines') &&
    /gsap\.timeline/.test(html) &&
    html.includes(`"${COMPOSITION_ID}"`)
  )
}

// Ask the LLM to write a hyperframes composition. Falls back to the
// deterministic template if the model produces something invalid.
async function generateCompositionHtml(
  post: SocialPostInput,
  assetUrls: string[]
): Promise<string> {
  const assetBlock = assetUrls.length
    ? `Customer brand assets you MAY embed as <img> (logo / product). Use tastefully; do not distort:\n${assetUrls.map((u, i) => `  ASSET_${i + 1}: ${u}`).join('\n')}`
    : `No brand assets provided. Text + motion graphics only.`

  const system = `You are a motion-graphics engineer authoring a HyperFrames composition that is rendered to MP4 by seeking a paused GSAP timeline frame-by-frame.

NON-NEGOTIABLE CONTRACT (breaking any of these makes the video a frozen frame):
- Output ONLY one complete HTML document. No markdown fences, no commentary.
- Load GSAP exactly: <script src="${GSAP_CDN}"></script>. No other external resources except provided asset image URLs.
- The root element MUST have: id="${COMPOSITION_ID}" data-composition-id="${COMPOSITION_ID}" data-width="${VIDEO_WIDTH}" data-height="${VIDEO_HEIGHT}" data-start="0" data-duration="${VIDEO_DURATION_SECONDS}" data-root="true".
- ALL motion MUST be driven by ONE paused GSAP timeline: gsap.timeline({paused:true}). Do NOT use CSS @keyframes/animation/transition for motion — they are NOT seeked.
- You MUST register it: window.__timelines["${COMPOSITION_ID}"] = tl; (and set window.__timelines = window.__timelines || {} first).
- The timeline's total length MUST reach ${VIDEO_DURATION_SECONDS}s (add a tiny trailing tween at t=${VIDEO_DURATION_SECONDS} if needed).
- Canvas exactly ${VIDEO_WIDTH}x${VIDEO_HEIGHT}px (9:16), <body> that exact size, overflow hidden. Dark background, bold high-contrast typography, system fonts. Silent (no audio). Works for ANY niche.
- Sequence: reveal HOOK (big) first, then BODY, then a CTA end card; hold the CTA to the end.

Here is a MINIMAL VALID example to follow exactly for structure (rewrite the visuals/animation to be better, but keep the contract):
${buildFallbackComposition(post, assetUrls)}`

  const user = `Compose the ${post.platform} video.
HOOK: ${post.hook}
BODY: ${post.body}
CTA: ${post.cta}
${assetBlock}
Return the full HTML document now.`

  try {
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
    const html = stripCodeFences(text).trim()
    if (isValidComposition(html)) return html
    console.warn('[Hyperframes] LLM composition invalid — using deterministic fallback')
  } catch (err) {
    console.warn('[Hyperframes] LLM composition errored — using deterministic fallback:', err)
  }
  return buildFallbackComposition(post, assetUrls)
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
