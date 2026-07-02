// Magazine archetype — full-bleed editorial cover for premium_editorial.
// Structurally distinct from Hero (composeCover.ts): no clip-path sandwich,
// no subject-occlusion dependency. Typography is a clean block anchored to
// the lower third over a full-bleed backdrop; subject (if present) is a
// secondary framed inset, never required. Reuses the same conventions as
// Hero/slideHtml (buildFontFaceBlock, SLIDE_DURATION, COMPOSITION_ID,
// window.__timelines["slide"] contract) but is its own file — imports
// nothing from composeCover.ts except its plain data types.
import { STYLE_LIBRARY } from '@/lib/designSystem/styleLibrary'
import { buildFontFaceBlock } from '../fonts'
import { SLIDE_DURATION, COMPOSITION_ID } from '../slideHtml'
import type { ArchetypeLayoutInput, ArchetypePlanInput, ArchetypePlan, CoverArchetypeModule } from './types'
import type { TypographyToken } from '../composeCover'

const GSAP_CDN = 'https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js'

function esc(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function headlineHtml(tokens: TypographyToken[]): string {
  return tokens
    .map(t => {
      const cls = ['mtok', `mtok-${t.scale ?? 'lg'}`, t.color === 'accent' ? 'mtok-accent' : '']
        .filter(Boolean)
        .join(' ')
      return `<span class="${cls}">${esc(t.text)}</span>${t.break ? '<br>' : ''}`
    })
    .join('')
}

// One xl word per line like Hero's rhythm today (Tier-1 choreography, no
// fit-driven optical balancing). Deliberately duplicated rather than
// imported from archetypes/hero.ts — keeps Magazine's file self-contained
// and avoids a cross-archetype dependency for four lines of logic.
function magazineHeadlineTokens(title: string, highlightWord?: string): TypographyToken[] {
  const words = title.trim().split(/\s+/).filter(Boolean)
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/gi, '')
  const hw = highlightWord ? norm(highlightWord) : ''
  return words.map((w, i) => ({
    text: w,
    scale: 'xl' as const,
    color: hw && norm(w) === hw ? ('accent' as const) : ('fg' as const),
    break: i < words.length - 1,
  }))
}

function planMagazine(input: ArchetypePlanInput): ArchetypePlan {
  const { beat, resolved, ctx } = input
  const style = STYLE_LIBRARY[resolved.style_id]
  const subjectPrompt = [
    'Photograph containing absolutely no text, letters, words, captions, or logos anywhere in frame.',
    `Cinematic editorial photograph for a magazine-style social cover about ${ctx.topic}.`,
    `Visual concept in the spirit of: ${style.hook_technique}.`,
    'Isolated subject only if a person/object is included, completely transparent background, sharp clean cut-out edges, soft studio rim lighting.',
  ].join(' ')
  const bgPrompt = [
    'Image containing absolutely no text, letters, words, captions, or logos anywhere in frame.',
    `Full-bleed cinematic editorial backdrop for a magazine cover about ${ctx.topic}.`,
    'Generous negative space, soft directional light, refined muted palette, portrait orientation, magazine masthead quality.',
  ].join(' ')
  return { headline: magazineHeadlineTokens(beat.title, beat.highlightWord), subjectPrompt, bgPrompt, handle: ctx.handle }
}

function layoutMagazine(input: ArchetypeLayoutInput): string {
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
  const hl = headlineHtml(headline)
  const fontFaceBlock = buildFontFaceBlock([displayFont, bodyFont])

  const bgLayer =
    `<div class="layer" id="layer-bg" style="z-index:0">` +
    (hasBg ? `<img id="cover-bg" src="${assets.background}" alt="" />` : ``) +
    `</div>`

  // Subject is a secondary framed inset — the structural difference from
  // Hero's full-frame occluding cutout. Never required (canRender: true).
  const subjectLayer = hasSubject
    ? `<div class="layer" id="layer-subject-frame" style="z-index:1;opacity:0"><img id="subject" src="${assets.subject!.dataUri}" alt="" /></div>`
    : ''

  const headlineLayer = `<div class="layer headline-block" id="headline" style="z-index:2;opacity:0">${hl}</div>`

  const handlePill = handle
    ? `<div class="handle-pill">@${esc(handle)}</div>`
    : ''
  const badges = `<div class="layer" id="layer-badges" style="z-index:3">${handlePill}</div>`

  const anims = [
    hasBg ? `tl.fromTo("#cover-bg",{scale:1.06},{scale:1,duration:${SLIDE_DURATION},ease:"none"},0);` : '',
    hasSubject ? `tl.fromTo("#layer-subject-frame",{opacity:0,x:24},{opacity:1,x:0,duration:0.6,ease:"power3.out"},0.15);` : '',
    `tl.fromTo("#headline",{opacity:0,y:24},{opacity:1,y:0,duration:0.7,ease:"power3.out"},0.35);`,
    `tl.fromTo("#layer-badges",{opacity:0},{opacity:1,duration:0.4},0.9);`,
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
#layer-subject-frame{inset:auto 64px auto auto;top:96px;width:340px;height:420px;border-radius:12px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.35)}
#layer-subject-frame img{width:100%;height:100%;object-fit:cover;display:block}
.headline-block{display:flex;flex-direction:column;justify-content:flex-end;padding:0 72px 140px}
.mtok{
  font-family:'${displayFont}',sans-serif;
  display:inline-block;color:${fg};
  font-weight:${fc.title_weight};
  letter-spacing:${fc.title_tracking};
  line-height:${fc.title_hero_line_height};
  text-transform:${fc.title_transform};
  text-shadow:0 2px 18px rgba(0,0,0,0.35);
}
.mtok-xl{font-size:${fc.title_hero_size}}
.mtok-lg{font-size:${fc.title_size}px}
.mtok-md{font-size:${Math.round(fc.title_size * 0.6)}px}
.mtok-accent{color:${accent};font-style:italic}
.handle-pill{
  position:absolute;top:40px;left:64px;
  font-family:'${bodyFont}',sans-serif;font-size:22px;font-weight:600;letter-spacing:1px;
  color:${fg};background:${accent}1f;padding:8px 18px;border-radius:999px;white-space:nowrap;
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
  ${subjectLayer}
  ${headlineLayer}
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

export const magazineArchetype: CoverArchetypeModule = {
  id: 'magazine',
  plan: planMagazine,
  layout: layoutMagazine,
  canRender: () => true,
}
