// Modular CTA Kit — renders a cta CarouselBeat as two platform-branded slides:
//   buildIgCtaSlide  → Instagram gradient, comment automation, IG camera icon
//   buildTtCtaSlide  → TikTok dark theme, DM automation, TikTok icon + duotone bars
//
// Both slides are valid GSAP compositions (Hyperframes-compatible) and can be
// static-screenshot tested by injecting the visibility override before </head>.

import { COMPOSITION_ID, SLIDE_DURATION } from './slideHtml'
import type { CarouselBeat } from './types'

// Matches GSAP_CDN in slideHtml.ts — not exported there, so repeated here.
const GSAP_CDN = 'https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js'

function esc(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ── Inline SVG logos ───────────────────────────────────────────────────────

const IG_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
  stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
  <circle cx="12" cy="12" r="4"/>
  <circle cx="17.5" cy="6.5" r="1.5" fill="white" stroke="none"/>
</svg>`

const TT_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path fill="white" d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0
    0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a
    6.24 6.24 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0
    0 0 6.33-6.34V8.73a8.12 8.12 0 0 0 4.75 1.52V6.81a4.87 4.87 0 0 1-1-.12z"/>
</svg>`

// ── Instagram CTA slide ────────────────────────────────────────────────────

export function buildIgCtaSlide(beat: CarouselBeat): string {
  const keyword      = esc(beat.automationKeyword || 'REPLY')
  const instructions = esc(beat.ctaInstagramInstructions || 'Comment this word below — we\'ll DM you instantly via Manychat.')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1080,height=1350">
<script src="${GSAP_CDN}"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1350px;overflow:hidden}
#${COMPOSITION_ID}{
  position:relative;width:1080px;height:1350px;overflow:hidden;
  background:linear-gradient(135deg,#833ab4 0%,#fd1d1d 50%,#fcb045 100%);
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:80px 72px;gap:44px;
}
.ig-icon{width:108px;height:108px;flex-shrink:0}
.prompt-text{
  font-family:'Georgia',serif;font-size:48px;
  color:rgba(255,255,255,0.85);letter-spacing:3px;text-align:center;
}
.keyword-pill{
  background:rgba(255,255,255,0.12);
  border:3px solid rgba(255,255,255,0.55);
  border-radius:120px;padding:28px 72px;
}
.keyword-text{
  font-family:'Georgia',serif;
  font-size:clamp(72px,10vw,128px);font-weight:900;
  color:#fff;line-height:1;letter-spacing:-2px;text-align:center;
}
.instructions{
  font-family:'Arial',sans-serif;font-size:36px;
  color:rgba(255,255,255,0.82);text-align:center;line-height:1.55;max-width:820px;
}
.auto-badge{
  background:rgba(0,0,0,0.22);border:1px solid rgba(255,255,255,0.18);border-radius:60px;
  padding:20px 52px;font-family:'Arial',sans-serif;font-size:28px;color:rgba(255,255,255,0.9);
}
</style>
</head>
<body>
<div id="${COMPOSITION_ID}"
  data-composition-id="${COMPOSITION_ID}"
  data-width="1080" data-height="1350"
  data-start="0" data-duration="${SLIDE_DURATION}" data-root="true">
  <div id="ig-icon" class="ig-icon" style="opacity:0">${IG_ICON_SVG}</div>
  <div id="prompt" class="prompt-text" style="opacity:0">Comment the word</div>
  <div id="pill" class="keyword-pill" style="opacity:0">
    <div class="keyword-text">${keyword}</div>
  </div>
  <div id="instructions" class="instructions" style="opacity:0">${instructions}</div>
  <div id="badge" class="auto-badge" style="opacity:0">⚡ Instant DM via Manychat</div>
</div>
<script>
  window.__timelines = window.__timelines || {};
  var tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });
  tl.fromTo("#ig-icon",{opacity:0,y:24},{opacity:0.9,y:0,duration:0.5},0.1);
  tl.fromTo("#prompt",{opacity:0,y:20},{opacity:1,y:0,duration:0.5},0.3);
  tl.fromTo("#pill",{opacity:0,scale:0.88},{opacity:1,scale:1,duration:0.65},0.55);
  tl.fromTo("#instructions",{opacity:0,y:16},{opacity:1,y:0,duration:0.5},0.95);
  tl.fromTo("#badge",{opacity:0},{opacity:1,duration:0.4},1.4);
  tl.to("#${COMPOSITION_ID}",{opacity:1,duration:0.01},${SLIDE_DURATION});
  window.__timelines["${COMPOSITION_ID}"] = tl;
</script>
</body>
</html>`
}

// ── TikTok CTA slide ───────────────────────────────────────────────────────

export function buildTtCtaSlide(beat: CarouselBeat): string {
  const keyword      = esc(beat.automationKeyword || 'REPLY')
  const instructions = esc(beat.ctaTiktokInstructions || 'DM us this word and we\'ll send you access instantly.')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1080,height=1350">
<script src="${GSAP_CDN}"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1350px;overflow:hidden;background:#010101}
#${COMPOSITION_ID}{
  position:relative;width:1080px;height:1350px;overflow:hidden;background:#010101;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:80px 72px;gap:44px;
}
/* Duotone accent rails */
.tt-rail{position:absolute;top:0;bottom:0;width:10px}
.tt-rail-left{left:0;background:#FF0050}
.tt-rail-right{right:0;background:#00F2EA}
.tt-icon{width:108px;height:108px;flex-shrink:0}
.prompt-text{
  font-family:'Arial',sans-serif;font-size:48px;
  color:rgba(255,255,255,0.65);letter-spacing:3px;text-align:center;
}
.keyword-text{
  font-family:'Arial Black','Arial',sans-serif;
  font-size:clamp(72px,10vw,128px);font-weight:900;
  color:#fff;line-height:1;letter-spacing:-2px;text-align:center;
  /* TikTok chromatic aberration signature */
  text-shadow:4px 4px 0 #FF0050,-4px -4px 0 #00F2EA;
}
.instructions{
  font-family:'Arial',sans-serif;font-size:36px;
  color:rgba(255,255,255,0.78);text-align:center;line-height:1.55;max-width:820px;
}
.auto-badge{
  background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:60px;
  padding:20px 52px;font-family:'Arial',sans-serif;font-size:28px;color:rgba(255,255,255,0.55);
}
</style>
</head>
<body>
<div id="${COMPOSITION_ID}"
  data-composition-id="${COMPOSITION_ID}"
  data-width="1080" data-height="1350"
  data-start="0" data-duration="${SLIDE_DURATION}" data-root="true">
  <div class="tt-rail tt-rail-left"></div>
  <div class="tt-rail tt-rail-right"></div>
  <div id="tt-icon" class="tt-icon" style="opacity:0">${TT_ICON_SVG}</div>
  <div id="prompt" class="prompt-text" style="opacity:0">DM us the word</div>
  <div id="keyword" class="keyword-text" style="opacity:0">${keyword}</div>
  <div id="instructions" class="instructions" style="opacity:0">${instructions}</div>
  <div id="badge" class="auto-badge" style="opacity:0">⚡ Auto-reply via Manychat</div>
</div>
<script>
  window.__timelines = window.__timelines || {};
  var tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });
  tl.fromTo("#tt-icon",{opacity:0,y:24},{opacity:1,y:0,duration:0.5},0.1);
  tl.fromTo("#prompt",{opacity:0,y:20},{opacity:1,y:0,duration:0.5},0.3);
  tl.fromTo("#keyword",{opacity:0,scale:0.85},{opacity:1,scale:1,duration:0.7},0.55);
  tl.fromTo("#instructions",{opacity:0,y:16},{opacity:1,y:0,duration:0.5},1.0);
  tl.fromTo("#badge",{opacity:0},{opacity:1,duration:0.4},1.45);
  tl.to("#${COMPOSITION_ID}",{opacity:1,duration:0.01},${SLIDE_DURATION});
  window.__timelines["${COMPOSITION_ID}"] = tl;
</script>
</body>
</html>`
}
