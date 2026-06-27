// Editorial cover composer — Hero archetype (SPIKE).
//
// Proves the architecture's core bet: the renderer (not the image model) owns
// composition by stacking SEMANTIC LAYERS, with a transparent subject cutout
// sandwiched BETWEEN two copies of the headline:
//
//   BACKGROUND (z0) · TYPE_BACK (z1) · SUBJECT α-cutout (z2) · TYPE_FRONT (z3, clipped) · BADGES (z4)
//
// TYPE_BACK renders the full headline behind the subject. TYPE_FRONT is an
// identical, identically-positioned copy clipped to `overlapBand` so only that
// vertical slice paints OVER the subject — the "type behind the head, but the
// lower line crosses in front" look (bold_personal). No model compositing, no
// pixel masking: deterministic CSS z-order + clip-path.
//
// Guiding principles (whole engine): typography is the primary visual object,
// imagery amplifies it; assets generate pixels only, the renderer composes.
//
// Hyperframes contract is identical to slideHtml.ts: one paused GSAP timeline
// registered at window.__timelines["slide"], reaching SLIDE_DURATION. CSS
// @keyframes/transition are forbidden (they freeze frame-0 under the renderer).
import { STYLE_LIBRARY } from '@/lib/designSystem/styleLibrary'
import type { ResolvedDesignSystem } from '@/lib/designSystem/resolveDesignSystem'
import { buildFontFaceBlock } from './fonts'

const GSAP_CDN = 'https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js'
const COMPOSITION_ID = 'slide'
const SLIDE_DURATION = 3 // seconds; matches slideHtml.SLIDE_DURATION

// ── Tier-1 typographic choreography ────────────────────────────────────────
// A structured superset of the old single `highlightWord`: per-token scale,
// weight, color, and line breaks. Tier-2 (auto line-break optimization,
// fit-driven condensation, optical balancing) is deliberately NOT here yet.
export type TokenScale = 'xl' | 'lg' | 'md'
export type TypographyToken = {
  text: string
  scale?: TokenScale       // default 'lg'
  weight?: number          // optional explicit font-weight
  color?: 'fg' | 'accent'  // default 'fg'
  break?: boolean          // line break after this token
}

// A subject is origin-agnostic: the Asset Provider may produce it via
// segmentation, native transparent generation, an upload, or stock. The
// composer only needs the compositing facts — alpha + bounds.
export type SubjectAsset = {
  dataUri: string
  hasAlpha: boolean
  bbox: { x: number; y: number; w: number; h: number } // px in the 1080×1350 frame
}
export type EditorialAssets = {
  background: string | null
  subject: SubjectAsset | null
  accents?: string[]
}

export type ComposeCoverInput = {
  resolved: ResolvedDesignSystem
  headline: TypographyToken[]
  assets: EditorialAssets
  // Calibration knob: the vertical band (% of 1350px) where the headline reads
  // IN FRONT of the subject. Designers will want to nudge this per style — keep
  // it a parameter, never a magic constant. Default derives from the subject's
  // bounding box (the band the figure actually occupies).
  overlapBand?: { topPct: number; bottomPct: number }
  handle?: string
}

function esc(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Render the headline tokens to spans. The SAME markup is used for the back and
// front copies so the two layers align pixel-for-pixel.
function headlineHtml(tokens: TypographyToken[]): string {
  return tokens
    .map(t => {
      const cls = ['tok', `tok-${t.scale ?? 'lg'}`, t.color === 'accent' ? 'tok-accent' : '']
        .filter(Boolean)
        .join(' ')
      const wstyle = t.weight ? ` style="font-weight:${t.weight}"` : ''
      return `<span class="${cls}"${wstyle}>${esc(t.text)}</span>${t.break ? '<br>' : ''}`
    })
    .join('')
}

// Default overlap band from the subject bbox. ONLY the lower slice of the figure
// carries type in front — the rest of the figure occludes the headline, which is
// the whole point (type-behind-subject). Setting the band to the figure's full
// span would paint type in front everywhere the figure is and erase the behind
// effect. Bias to the bottom ~20% of the subject.
function defaultBand(subject: SubjectAsset | null): { topPct: number; bottomPct: number } {
  if (!subject) return { topPct: 55, bottomPct: 100 }
  const lowerSlice = subject.bbox.y + subject.bbox.h * 0.78
  const topPct = Math.max(0, Math.min(92, Math.round((lowerSlice / 1350) * 100)))
  return { topPct, bottomPct: 100 }
}

export function composeCover(input: ComposeCoverInput): string {
  const { resolved, headline, assets, handle } = input
  const style = STYLE_LIBRARY[resolved.style_id]
  const fc = style.font_constraints
  const displayFont = style.typography.display_font
  const bodyFont = style.typography.body_font
  const bg = resolved.background
  const fg = resolved.primary_color
  const accent = resolved.accent

  const hasBg = Boolean(assets.background)
  const hasSubject = Boolean(assets.subject)
  const band = input.overlapBand ?? defaultBand(assets.subject)
  const insetTop = Math.max(0, Math.min(100, band.topPct))
  const insetBottom = Math.max(0, Math.min(100, 100 - band.bottomPct))

  const hl = headlineHtml(headline)
  const fontFaceBlock = buildFontFaceBlock([displayFont, bodyFont])

  // ── Layers (only what this archetype needs) ───────────────────────────────
  const bgLayer =
    `<div class="layer" id="layer-bg" style="z-index:0">` +
    (hasBg ? `<img id="cover-bg" src="${assets.background}" alt="" />` : ``) +
    `</div>`

  const typeBack = `<div class="layer headline-layer" id="type-back" style="z-index:1;opacity:0">${hl}</div>`

  // Subject + front type copy only exist when there's something to occlude.
  const subjectLayer = hasSubject
    ? `<div class="layer" id="layer-subject" style="z-index:2;opacity:0"><img id="subject" src="${assets.subject!.dataUri}" alt="" /></div>`
    : ''
  const typeFront = hasSubject
    ? `<div class="layer headline-layer" id="type-front" style="z-index:3;opacity:0">${hl}</div>`
    : ''

  const handlePill = handle
    ? `<div class="handle-pill">@${esc(handle)}</div>`
    : ''
  const badges =
    `<div class="layer" id="layer-badges" style="z-index:4">${handlePill}<div class="swipe-cue">SWIPE ›</div></div>`

  // ── GSAP timeline (REQUIRED — Hyperframes seeks frame-by-frame) ────────────
  const anims = [
    hasBg ? `tl.fromTo("#cover-bg",{scale:1.06},{scale:1,duration:${SLIDE_DURATION},ease:"none"},0);` : '',
    `tl.fromTo("#type-back",{opacity:0,y:34},{opacity:1,y:0,duration:0.7,ease:"power3.out"},0.1);`,
    hasSubject ? `tl.fromTo("#layer-subject",{opacity:0,y:28},{opacity:1,y:0,duration:0.7,ease:"power3.out"},0.35);` : '',
    hasSubject ? `tl.fromTo("#type-front",{opacity:0},{opacity:1,duration:0.5},0.65);` : '',
    `tl.fromTo("#layer-badges",{opacity:0},{opacity:1,duration:0.4},1.0);`,
    `tl.to("#${COMPOSITION_ID}",{opacity:1,duration:0.01},${SLIDE_DURATION});`,
  ]
    .filter(Boolean)
    .join('\n  ')

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
#${COMPOSITION_ID}{position:relative;width:1080px;height:1350px;overflow:hidden;background:${bg}}
.layer{position:absolute;inset:0}
#layer-bg img{width:100%;height:100%;object-fit:cover;display:block}
/* α-cutout subject: anchored to the bottom edge, contained so the figure keeps proportion */
#layer-subject img{width:100%;height:100%;object-fit:contain;object-position:center bottom;display:block}
/* Headline layers: identical box so back/front copies align pixel-for-pixel */
.headline-layer{display:flex;flex-direction:column;justify-content:flex-start;padding:96px 72px 0}
/* The front copy reads OVER the subject only inside the overlap band */
#type-front{clip-path:inset(${insetTop}% 0 ${insetBottom}% 0)}
.tok{
  font-family:'${displayFont}',sans-serif;
  display:inline-block;color:${fg};
  font-weight:${fc.title_weight};
  letter-spacing:${fc.title_tracking};
  line-height:${fc.title_hero_line_height};
  text-transform:${fc.title_transform};
  text-shadow:0 2px 18px rgba(0,0,0,0.45);
}
.tok-xl{font-size:${fc.title_hero_size}}
.tok-lg{font-size:${fc.title_size}px}
.tok-md{font-size:${Math.round(fc.title_size * 0.62)}px}
.tok-accent{color:${accent}}
.handle-pill{
  position:absolute;top:40px;left:50%;transform:translateX(-50%);
  font-family:'${bodyFont}',sans-serif;font-size:24px;font-weight:700;letter-spacing:1px;
  color:${fg};background:${accent}26;padding:8px 20px;border-radius:999px;white-space:nowrap;
}
.swipe-cue{
  position:absolute;right:40px;top:50%;transform:translateY(-50%);
  font-family:'${bodyFont}',sans-serif;font-size:24px;font-weight:800;letter-spacing:2px;
  color:${accent};text-shadow:0 2px 10px rgba(0,0,0,0.5);
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
  ${bgLayer}
  ${typeBack}
  ${subjectLayer}
  ${typeFront}
  ${badges}
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
