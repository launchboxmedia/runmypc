// Generate one carousel slide as a complete standalone HTML document via Haiku.
// All slides are GSAP-timeline animated compositions (3-second loops) — the
// Hyperframes render service seeks the timeline frame-by-frame for MP4 output.
// CSS @keyframes/transition are NOT seeked → frozen; use ONLY GSAP on the tl.
import Anthropic from '@anthropic-ai/sdk'
import { STYLE_LIBRARY } from '@/lib/designSystem/styleLibrary'
import type { ResolvedDesignSystem } from '@/lib/designSystem/resolveDesignSystem'
import type { CarouselBeat } from './types'
import { buildFontFaceBlock } from './fonts'

const HTML_MODEL = 'claude-haiku-4-5-20251001'
const COVER_TOKEN = '__COVER_VISUAL__'
export const COMPOSITION_ID = 'slide'
export const SLIDE_DURATION = 3   // seconds per slide
const GSAP_CDN = 'https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js'

let _anthropic: Anthropic
function anthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _anthropic
}

export type SlideHtmlDeps = { generate: (prompt: string) => Promise<string> }

const defaultDeps: SlideHtmlDeps = {
  async generate(prompt) {
    const res = await anthropic().messages.create({
      model: HTML_MODEL,
      max_tokens: 2500,
      messages: [{ role: 'user', content: prompt }],
    })
    return res.content[0]?.type === 'text' ? res.content[0].text : ''
  },
}

// A valid slide composition must have the Hyperframes contract elements.
export function isValidSlideComposition(html: string): boolean {
  return (
    html.includes('data-root="true"') &&
    html.includes('window.__timelines') &&
    /gsap\.timeline/.test(html) &&
    html.includes(`"${COMPOSITION_ID}"`)
  )
}

// Safety net: remove NO GLYPH placeholder markers Haiku occasionally emits.
export function stripGlyphPlaceholders(html: string): string {
  const placeholder = /n\s*o[\s\-_]*g\s*l\s*y\s*p\s*h/gi
  return html
    .replace(new RegExp(`<([a-z]+)([^>]*)>\\s*${placeholder.source}\\s*<\\/\\1>`, 'gi'), '')
    .replace(placeholder, '')
}

function esc(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Deterministic fallback slide — valid GSAP composition the render service
// will always accept. Uses CSS Grid (1080×1350, 4:5) with inline font injection.
// Replaces the old padding:72px approach with strict grid math.
export function buildFallbackSlide(
  beat: CarouselBeat,
  resolved: ResolvedDesignSystem,
  options?: { bodyTextureUri?: string }
): string {
  const style = STYLE_LIBRARY[resolved.style_id]
  const bg = resolved.background
  const fg = resolved.primary_color
  const accent = resolved.accent
  const displayFont = style.typography.display_font
  const bodyFont = style.typography.body_font

  const fontFaceBlock = buildFontFaceBlock([displayFont, bodyFont])
  const isSplitCover = beat.isCover && resolved.split_image_cover
  const isFullBleedCover = beat.isCover && !resolved.split_image_cover
  const isBodySlide = !beat.isCover
  const textureUri = isBodySlide ? (options?.bodyTextureUri ?? null) : null
  const isHero = beat.slideComponent === 'cover' || beat.slideComponent === 'cta'

  // Wrap highlightWord in accent span — safe: both pieces are individually escaped
  function titleHtml(title: string, highlightWord?: string): string {
    if (!highlightWord) return esc(title)
    const idx = title.toLowerCase().indexOf(highlightWord.toLowerCase())
    if (idx === -1) return esc(title)
    return (
      esc(title.slice(0, idx)) +
      `<span class="highlight">${esc(title.slice(idx, idx + highlightWord.length))}</span>` +
      esc(title.slice(idx + highlightWord.length))
    )
  }

  // Content elements (opacity:0 — GSAP reveals via timeline)
  const titleClass = isHero ? 'slide-title hero-text' : 'slide-title'
  const titleEl = `<div id="title" class="${titleClass}" style="opacity:0">${titleHtml(beat.title, beat.highlightWord)}</div>`
  const subheadEl = beat.subhead
    ? `<div id="subhead" class="slide-subhead" style="opacity:0">${esc(beat.subhead)}</div>`
    : ''
  const calloutEl = beat.calloutBox
    ? `<div id="callout" class="slide-callout" style="opacity:0">${esc(beat.calloutBox)}</div>`
    : ''
  const bulletsEl = beat.bullets?.length
    ? `<ul id="bullets" class="slide-bullets" style="opacity:0">${beat.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>`
    : ''
  const checklistEl = beat.checklist?.length
    ? `<ul id="checklist" class="slide-checklist" style="opacity:0">${beat.checklist.map(c => `<li>✓ ${esc(c)}</li>`).join('')}</ul>`
    : ''
  const proofEl = beat.proofImageUri
    ? `<div id="proof" class="premium-proof-frame" style="opacity:0"><img src="${esc(beat.proofImageUri)}" alt="" /></div>`
    : ''
  const anchorEl = beat.bottomAnchor
    ? `<div id="anchor" class="slide-anchor" style="opacity:0">${esc(beat.bottomAnchor)}</div>`
    : ''

  // GSAP animations (REQUIRED — Hyperframes seeks timeline frame-by-frame)
  const anims = [
    `tl.fromTo("#title",{opacity:0,y:30},{opacity:1,y:0,duration:0.7},0.1);`,
    beat.subhead        ? `tl.fromTo("#subhead",{opacity:0,y:20},{opacity:1,y:0,duration:0.5},0.5);`                 : '',
    beat.calloutBox     ? `tl.fromTo("#callout",{opacity:0,x:-20},{opacity:1,x:0,duration:0.5},0.7);`                : '',
    beat.bullets?.length ? `tl.fromTo("#bullets",{opacity:0,y:15},{opacity:1,y:0,duration:0.5},0.8);`               : '',
    beat.checklist?.length ? `tl.fromTo("#checklist",{opacity:0,y:15},{opacity:1,y:0,duration:0.5},0.8);`           : '',
    beat.proofImageUri  ? `tl.fromTo("#proof",{opacity:0,y:20},{opacity:1,y:0,duration:0.6},0.9);`                  : '',
    beat.bottomAnchor   ? `tl.fromTo("#anchor",{opacity:0},{opacity:1,duration:0.4},1.4);`                           : '',
    beat.isCover        ? `tl.fromTo("#cover-bg",{scale:1.05},{scale:1,duration:${SLIDE_DURATION},ease:"none"},0);`  : '',
    `tl.to("#${COMPOSITION_ID}",{opacity:1,duration:0.01},${SLIDE_DURATION});`,
  ].filter(Boolean).join('\n  ')

  // HTML structure varies by cover mode
  let innerHtml: string
  if (isSplitCover) {
    // 55% image / 45% text — split-layout takes the full grid
    innerHtml = `
<div class="split-layout">
  <div class="split-image-zone">
    <img id="cover-bg" src="${COVER_TOKEN}" alt="" />
  </div>
  <div class="split-text-zone">
    ${titleEl}
    ${subheadEl}
    ${anchorEl}
  </div>
</div>`
  } else if (isFullBleedCover) {
    // Full-bleed cover: ::after pseudo-element scrim guarantees text contrast
    innerHtml = `
<div class="cover-backdrop-wrap">
  <img id="cover-bg" src="${COVER_TOKEN}" alt="" />
</div>
<div class="cover-text-overlay">
  ${titleEl}
  ${subheadEl}
  ${anchorEl}
</div>`
  } else {
    // Body slide: content in the safe-zone grid cell
    innerHtml = `
<div class="slide-content-area">
  ${titleEl}
  ${subheadEl}
  ${calloutEl}
  ${bulletsEl}
  ${checklistEl}
  ${proofEl}
</div>
${beat.bottomAnchor ? `<div class="slide-anchor-row">${anchorEl}</div>` : ''}`
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1080,height=1350">
<script src="${GSAP_CDN}"></script>
<style>
${fontFaceBlock}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1350px;overflow:hidden;background:${bg}}
/* 4:5 CSS Grid — 72px gutters, inner cell 936×1206 */
#${COMPOSITION_ID}{
  position:relative;width:1080px;height:1350px;
  display:grid;
  grid-template-columns:72px 1fr 72px;
  grid-template-rows:72px 1fr 72px;
  background:${bg};overflow:hidden;
}
/* ── Split cover (55 / 45) ── */
.split-layout{
  grid-column:1/-1;grid-row:1/-1;
  display:grid;grid-template-rows:55fr 45fr;
}
.split-image-zone{
  grid-row:1;position:relative;overflow:hidden;
}
.split-image-zone img{
  width:100%;height:100%;object-fit:cover;display:block;
}
.split-text-zone{
  grid-row:2;background:${bg};
  display:flex;flex-direction:column;justify-content:center;
  padding:56px 72px;gap:20px;
}
/* ── Full-bleed cover ── */
.cover-backdrop-wrap{
  position:absolute;inset:0;z-index:0;overflow:hidden;
}
.cover-backdrop-wrap img{
  width:100%;height:100%;object-fit:cover;display:block;
}
.cover-backdrop-wrap::after{
  content:'';
  position:absolute;inset:0;
  background:linear-gradient(to top,rgba(0,0,0,0.85) 0%,rgba(0,0,0,0) 60%);
  z-index:1;pointer-events:none;
}
.cover-text-overlay{
  position:relative;z-index:2;
  grid-column:2;grid-row:2;
  display:flex;flex-direction:column;gap:20px;align-self:end;
}
/* ── Body slide ── */
.slide-content-area{
  grid-column:2;grid-row:2;
  display:flex;flex-direction:column;gap:24px;
  position:relative;z-index:1;
}
${textureUri ? `
/* ── Editorial body texture ── */
#${COMPOSITION_ID}::before{
  content:'';position:absolute;inset:0;
  background-image:url('${textureUri}');
  background-size:cover;background-position:center;
  opacity:0.1;mix-blend-mode:multiply;z-index:0;
  pointer-events:none;
}` : ''}
.slide-anchor-row{
  grid-column:2;grid-row:3;
  display:flex;align-items:center;
}
/* ── Typography ── */
.slide-title{
  font-family:'${displayFont}',serif;
  font-size:72px;font-weight:800;
  color:${fg};line-height:1.1;
}
.hero-text{
  font-size:clamp(70px,9vw,130px);
  line-height:0.9;
}
.highlight{
  background:${accent}40;
  padding:0 6px 4px;
  border-radius:4px;
}
.slide-subhead{
  font-family:'${bodyFont}',sans-serif;
  font-size:38px;color:${fg};line-height:1.4;
}
.slide-bullets,.slide-checklist{list-style:none;padding:0;margin-top:8px;}
.slide-bullets li,.slide-checklist li{
  font-family:'${bodyFont}',sans-serif;
  font-size:34px;color:${fg};
  padding:8px 0;border-bottom:1px solid ${accent}33;
}
.slide-callout{
  border-left:6px solid ${accent};padding:20px 28px;
  font-family:'${bodyFont}',sans-serif;font-size:38px;color:${fg};
}
.slide-anchor{
  font-family:'${bodyFont}',sans-serif;font-size:32px;color:${accent};
}
/* ── Social proof frame ── */
.premium-proof-frame{
  transform:rotate(-1.5deg);
  box-shadow:
    0 24px 64px rgba(0,0,0,0.45),
    0 8px 24px rgba(0,0,0,0.25),
    inset 0 1px 0 rgba(255,255,255,0.15);
  border:1px solid rgba(255,255,255,0.18);
  border-radius:12px;overflow:hidden;
  display:block;max-width:100%;margin-top:32px;
  max-height:480px;
}
.premium-proof-frame img{
  object-fit:contain;width:100%;height:100%;display:block;
}
</style>
</head>
<body>
<div id="${COMPOSITION_ID}"
  data-composition-id="${COMPOSITION_ID}"
  data-width="1080"
  data-height="1350"
  data-start="0"
  data-duration="${SLIDE_DURATION}"
  data-root="true">
  ${innerHtml}
</div>
<script>
  window.__timelines = window.__timelines || {};
  var tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });
  ${anims}
  window.__timelines["${COMPOSITION_ID}"] = tl;
</script>
</body>
</html>`
}

// Deterministically stamp a brand logo into the bottom-left corner of a slide.
// Uses position:fixed relative to the render viewport. Returns html unchanged
// when there is no logo.
export function stampLogo(html: string, logoDataUri: string | null | undefined): string {
  if (!logoDataUri) return html
  const mark = `<img src="${logoDataUri}" alt="" style="position:fixed;bottom:44px;left:44px;height:56px;width:auto;max-width:200px;object-fit:contain;z-index:2147483647;pointer-events:none;" />`
  const idx = html.toLowerCase().lastIndexOf('</body>')
  if (idx === -1) return html + mark
  return html.slice(0, idx) + mark + html.slice(idx)
}

// Pull the HTML document out of any markdown fences / stray prose Haiku adds.
export function extractHtml(raw: string): string {
  const fenced = raw.match(/```(?:html)?\s*([\s\S]*?)```/i)
  const body = fenced ? fenced[1] : raw
  const docMatch = body.match(/<!doctype[\s\S]*$/i) || body.match(/<html[\s\S]*<\/html>/i)
  return (docMatch ? docMatch[0] : body).trim()
}

function buildPrompt(input: {
  resolved: ResolvedDesignSystem
  beat: CarouselBeat
  handle?: string
  hasCoverVisual: boolean
  hasLogo: boolean
  retryNote?: string
}): string {
  const { resolved, beat, handle, hasCoverVisual, hasLogo, retryNote } = input
  const style = STYLE_LIBRARY[resolved.style_id]

  const beatFields = [
    `title (REQUIRED): "${esc(beat.title)}"`,
    beat.subhead ? `subhead: "${esc(beat.subhead)}"` : null,
    beat.calloutBox ? `calloutBox: "${esc(beat.calloutBox)}"` : null,
    beat.bullets?.length ? `bullets: ${JSON.stringify(beat.bullets)}` : null,
    beat.checklist?.length ? `checklist: ${JSON.stringify(beat.checklist)}` : null,
    beat.bottomAnchor ? `bottomAnchor: "${esc(beat.bottomAnchor)}"` : null,
    beat.body ? `body: "${esc(beat.body)}"` : null,
  ].filter(Boolean).join('\n')

  const coverInstruction = beat.isCover && hasCoverVisual
    ? `- A background visual is provided. Include exactly one <img id="cover-bg" src="${COVER_TOKEN}"> as the slide backdrop (position:absolute, inset:0, object-fit:cover, z-index:0). ${
        resolved.split_image_cover
          ? `SPLIT LAYOUT: image fills one half; solid ${resolved.background} block fills the other for headline.`
          : `Image is the backdrop; place headline over a legible zone with scrim/overlay if needed.`
      } Do NOT put a data-URI in the src — use the literal token ${COVER_TOKEN}.`
    : beat.isCover
      ? `- No background image. Strong type-driven cover on the ${resolved.background} background.`
      : `- No images (no cover token, no img tags for decoration).`

  return [
    `Output ONLY a complete standalone HTML document for ONE Instagram carousel slide. No commentary, no markdown fences.`,
    ``,
    `NON-NEGOTIABLE CONTRACT (breaking any of these makes the slide a frozen frame or fails QA):`,
    `- Load GSAP exactly: <script src="${GSAP_CDN}"></script> — this is the ONLY allowed external resource.`,
    `- Root element MUST have: id="${COMPOSITION_ID}" data-composition-id="${COMPOSITION_ID}" data-width="1080" data-height="1350" data-start="0" data-duration="${SLIDE_DURATION}" data-root="true".`,
    `- ALL motion MUST be driven by ONE paused GSAP timeline: gsap.timeline({paused:true}). Do NOT use CSS @keyframes/animation/transition — they produce a frozen frame.`,
    `- Register the timeline: window.__timelines = window.__timelines || {}; window.__timelines["${COMPOSITION_ID}"] = tl;`,
    `- Timeline total length MUST reach ${SLIDE_DURATION}s (add a trailing tween: tl.to("#${COMPOSITION_ID}",{opacity:1,duration:0.01},${SLIDE_DURATION})).`,
    `- Canvas exactly 1080×1350px. Overflow hidden.`,
    ``,
    `SLIDE ROLE: ${beat.beat.toUpperCase()} (${beat.isCover ? 'cover — slide 0' : `slide ${beat.index}`})`,
    handle && beat.isCover ? `Brand handle: show as @${handle} on the cover only.` : '',
    ``,
    `BEAT CONTENT — render EXACTLY these fields, nothing else invented:`,
    beatFields,
    ``,
    `HARD CONSTRAINT ON CONTENT: Render ONLY the fields listed above. Do NOT invent supplementary UI elements — no extra badges, tags, icons, decorative pills, extra callouts, or motivational copy that is not in the beat data. The style layout elements (page indicator, handle pill, hook device described below) are permitted, but only if they do not displace or distort the required fields.`,
    ``,
    `DESIGN SYSTEM — ${style.display_name}:`,
    `- Background: ${resolved.background}. Primary/text: ${resolved.primary_color}. Accent: ${resolved.accent}.`,
    `- Fonts: ONLY "${style.typography.display_font}" for headlines and "${style.typography.body_font}" for body/bullets. No @import, no Google Fonts, no external CSS.`,
    `- Typography: ${style.typography.treatment}`,
    `- Layout: ${style.layout_descriptor}`,
    `- Hook device (cover only, if beat is hook): ${style.hook_technique}`,
    coverInstruction,
    hasLogo ? `- A brand logo will be stamped in the BOTTOM-LEFT corner (~210×90px area). Keep that corner clear — no text, page dots, or key elements there.` : '',
    `- All text inside ≥64px safe margin, fully visible, never clipped or overflowing.`,
    `- Draw icons/graphics with pure CSS or inline SVG only — no icon fonts, no emoji-as-icon, no placeholder text.`,
    retryNote ? `\nPREVIOUS RENDER FAILED QA: ${retryNote}\nFix specifically: ${retryNote}` : '',
  ].filter(Boolean).join('\n')
}

export async function generateSlideHtml(
  input: {
    resolved: ResolvedDesignSystem
    beat: CarouselBeat
    handle?: string
    coverVisualDataUri?: string | null
    logoDataUri?: string | null
    retryNote?: string
  },
  deps: SlideHtmlDeps = defaultDeps
): Promise<string> {
  const hasCoverVisual = Boolean(input.beat.isCover && input.coverVisualDataUri)
  const hasLogo = Boolean(input.logoDataUri)
  const prompt = buildPrompt({
    resolved: input.resolved,
    beat: input.beat,
    handle: input.handle,
    hasCoverVisual,
    hasLogo,
    retryNote: input.retryNote,
  })

  const raw = await deps.generate(prompt)
  let html = stripGlyphPlaceholders(extractHtml(raw))

  // If Haiku produced something that won't animate, fall back to the
  // deterministic template rather than delivering a frozen frame.
  if (!isValidSlideComposition(html)) {
    console.warn(`[slideHtml] invalid composition for beat ${input.beat.index} (${input.beat.beat}), using fallback`)
    html = buildFallbackSlide(input.beat, input.resolved)
  }

  // Inject cover visual data-URI (cover slide only).
  if (hasCoverVisual && input.coverVisualDataUri) {
    html = html.split(COVER_TOKEN).join(input.coverVisualDataUri)
  } else {
    html = html.replace(/<img[^>]*id=["']cover-bg["'][^>]*>/gi, '').split(COVER_TOKEN).join('')
  }

  // Deterministic brand-mark stamp (bottom-left), independent of Haiku.
  html = stampLogo(html, input.logoDataUri)

  return html
}
