// Phase 1 — Agnostic Layout Engine static test harness.
// No API calls, no LLM routing, no Hyperframes.
// Generates opacity:1 HTML for visual verification via Playwright or browser.
// Usage: import { generateTestHtml } from './staticLayoutTest'
import { buildFontFaceBlock } from './fonts'
import { STYLE_LIBRARY } from '@/lib/designSystem/styleLibrary'
import type { ResolvedDesignSystem } from '@/lib/designSystem/resolveDesignSystem'

// ── Hardcoded test payload ──────────────────────────────────────────────────

export type TestBeat = {
  isCover: boolean
  title: string
  subhead?: string
  bullets?: string[]
  coverImageUri?: string   // data-URI or URL for cover backdrop
  proofImageUri?: string   // data-URI or URL for proof frame
}

// Inline SVG placeholders — no network required for Phase 1 visual test
const COVER_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="742">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a1a2e"/>
      <stop offset="50%" stop-color="#16213e"/>
      <stop offset="100%" stop-color="#0f3460"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="742" fill="url(#g)"/>
  <text x="540" y="330" font-family="sans-serif" font-size="52" fill="rgba(255,255,255,0.2)"
        text-anchor="middle" dominant-baseline="middle">COVER IMAGE PLACEHOLDER</text>
  <text x="540" y="420" font-family="sans-serif" font-size="32" fill="rgba(255,255,255,0.15)"
        text-anchor="middle" dominant-baseline="middle">1080 × 742 · split-image-zone (55%)</text>
</svg>`)}`

const PROOF_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="420">
  <rect width="800" height="420" fill="#e8f4f8" rx="8"/>
  <rect x="40" y="40" width="720" height="340" fill="white" rx="6"/>
  <text x="400" y="190" font-family="sans-serif" font-size="36" fill="#4a90d9"
        text-anchor="middle" dominant-baseline="middle">Social Proof Image</text>
  <text x="400" y="250" font-family="sans-serif" font-size="24" fill="#888"
        text-anchor="middle">premium-proof-frame · rotate(-1.5deg) · glass shadow</text>
</svg>`)}`

export const TEST_RESOLVED: ResolvedDesignSystem = {
  style_id: 'premium_editorial',
  source: 'job_override',
  primary_color: '#141414',
  accent: '#7A5C3E',
  background: '#F7F5F1',
  split_image_cover: true,
}

export const TEST_PAYLOAD: TestBeat[] = [
  {
    isCover: true,
    coverImageUri: COVER_SVG,
    title: 'Stop Losing Money on Bad Credit',
    subhead: 'The 5-step system that actually works',
  },
  {
    isCover: false,
    title: 'Client Result: 89-Point Score Jump',
    subhead: '6 months. No gimmicks.',
    bullets: [
      'Disputed 11 negative items',
      'Rebuilt payment history',
      'Utilization dropped to 8%',
    ],
    proofImageUri: PROOF_SVG,
  },
]

// ── HTML builder (static — opacity:1, no GSAP) ─────────────────────────────

function esc(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function buildStaticTestSlide(beat: TestBeat, resolved: ResolvedDesignSystem): string {
  const style = STYLE_LIBRARY[resolved.style_id]
  const { background: bg, primary_color: fg, accent } = resolved
  const displayFont = style.typography.display_font
  const bodyFont = style.typography.body_font
  const fontFaceBlock = buildFontFaceBlock([displayFont, bodyFont])

  const isSplitCover = beat.isCover && resolved.split_image_cover

  const titleEl     = `<div class="slide-title">${esc(beat.title)}</div>`
  const subheadEl   = beat.subhead  ? `<div class="slide-subhead">${esc(beat.subhead)}</div>` : ''
  const bulletsEl   = beat.bullets?.length
    ? `<ul class="slide-bullets">${beat.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : ''
  const proofEl     = beat.proofImageUri
    ? `<img class="premium-proof-frame" src="${beat.proofImageUri}" alt="Social proof" />` : ''

  let innerHtml: string
  if (isSplitCover) {
    innerHtml = `
<div class="split-layout">
  <div class="split-image-zone">
    <img src="${beat.coverImageUri || COVER_SVG}" alt="" />
  </div>
  <div class="split-text-zone">
    ${titleEl}${subheadEl}
  </div>
</div>`
  } else {
    innerHtml = `
<div class="slide-content-area">
  ${titleEl}${subheadEl}${bulletsEl}${proofEl}
</div>`
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
${fontFaceBlock}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1350px;overflow:hidden;background:${bg};font-size:16px}
/* 4:5 CSS Grid — 72px gutters, inner cell 936×1206 */
#slide{
  position:relative;width:1080px;height:1350px;
  display:grid;
  grid-template-columns:72px 1fr 72px;
  grid-template-rows:72px 1fr 72px;
  background:${bg};overflow:hidden;
}
/* ── Split cover (55% image / 45% text) ── */
.split-layout{
  grid-column:1/-1;grid-row:1/-1;
  display:grid;grid-template-rows:55fr 45fr;
}
.split-image-zone{grid-row:1;position:relative;overflow:hidden}
.split-image-zone img{width:100%;height:100%;object-fit:cover;display:block}
.split-text-zone{
  grid-row:2;background:${bg};
  display:flex;flex-direction:column;justify-content:center;
  padding:56px 72px;gap:20px;
}
/* ── Body slide ── */
.slide-content-area{
  grid-column:2;grid-row:2;
  display:flex;flex-direction:column;gap:24px;
}
/* ── Typography ── */
.slide-title{
  font-family:'${displayFont}',Georgia,serif;
  font-size:72px;font-weight:800;
  color:${fg};line-height:1.1;
}
.slide-subhead{
  font-family:'${bodyFont}',Arial,sans-serif;
  font-size:38px;color:${fg};line-height:1.4;opacity:0.8;
}
.slide-bullets{list-style:none;padding:0;margin-top:8px}
.slide-bullets li{
  font-family:'${bodyFont}',Arial,sans-serif;
  font-size:34px;color:${fg};
  padding:12px 0;
  border-bottom:1px solid ${accent}44;
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
  /* glass-rim shimmer */
  background:linear-gradient(135deg,rgba(255,255,255,0.12) 0%,rgba(255,255,255,0) 60%);
}
</style>
</head>
<body>
<div id="slide">${innerHtml}</div>
</body>
</html>`
}

export function generateTestHtml(): { cover: string; body: string } {
  return {
    cover: buildStaticTestSlide(TEST_PAYLOAD[0], TEST_RESOLVED),
    body:  buildStaticTestSlide(TEST_PAYLOAD[1], TEST_RESOLVED),
  }
}
