// PURE: turn an Instagram post {hook, body, cta} into an ordered carousel slide
// plan. Slide 0 is always the cover (hook). The final slide is always a single
// CTA. The middle is the body's insight lines, one beat each, clamped so the
// total lands in [5,7] without fabricating copy.
import type { SlidePlan } from './types'

const MIDDLE_MIN = 3 // -> total 5 (cover + 3 + cta) when enough body exists
const MIDDLE_MAX = 5 // -> total 7
const DEFAULT_CTA = 'Follow for more'

// Strip leading bullet glyphs / numbering / whitespace from a body line.
function cleanLine(line: string): string {
  return line.replace(/^[\s•\-–—✅☑️→▶►●▪·*]+/, '').replace(/^\d+[.)]\s*/, '').trim()
}

export function buildSlidePlan(post: { hook: string; body: string; cta: string }): SlidePlan[] {
  const bodyLines = (post.body || '')
    .split('\n')
    .map(cleanLine)
    .filter(Boolean)

  const cta = (post.cta || '').trim() || DEFAULT_CTA

  // Cover text: hook, else first body line (which is then consumed by the cover).
  let coverText = (post.hook || '').trim()
  let middlePool = bodyLines
  if (!coverText) {
    coverText = bodyLines[0] || 'Swipe →'
    middlePool = bodyLines.slice(1)
  }

  // Never duplicate the CTA line as a middle beat.
  middlePool = middlePool.filter(t => t.toLowerCase() !== cta.toLowerCase())

  // Clamp: drop extras beyond MIDDLE_MAX; do not fabricate up to MIDDLE_MIN.
  const middle = middlePool.slice(0, MIDDLE_MAX)
  void MIDDLE_MIN // documented floor; we never invent copy to reach it

  const slides: SlidePlan[] = []
  slides.push({ index: 0, beat: 'hook', isCover: true, text: coverText })
  middle.forEach((text, i) => {
    slides.push({ index: i + 1, beat: 'value', isCover: false, text })
  })
  slides.push({ index: slides.length, beat: 'cta', isCover: false, text: cta })

  return slides
}
