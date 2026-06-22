// Derive accent + background from (style, primaryColor). The customer's primary
// color is echoed as `primary`; accent and background are ALWAYS computed — never
// asked. A WCAG contrast guard guarantees the primary is legible on the
// background regardless of input, so the customer-color path and the
// implied_tone fallback path both produce a usable triad.

import { parse, formatHex, converter, wcagContrast } from 'culori'
import type { StyleId, Palette } from './styleLibrary'

const toHsl = converter('hsl')
const DARK_CANVAS: StyleId[] = ['bold_personal', 'sharp_professional']
const FALLBACK_PRIMARY = '#111827'

export function derivePalette(styleId: StyleId, primaryColor: string): Palette {
  const parsed = toHsl(parse(primaryColor))
  const primary = parsed ? (formatHex(parsed) ?? FALLBACK_PRIMARY) : FALLBACK_PRIMARY
  const h = parsed?.h ?? 0
  const s = parsed?.s ?? 0.5

  // Accent: complementary hue, saturated pop. Lightness is contrast-guarded
  // below so the accent stays legible AS TEXT on the background (a fixed l:0.55
  // mid-tone lands at only ~3.4:1 on light canvases — the low-contrast label bug).
  const accentHue = (h + 150) % 360
  const accentSat = Math.min(0.9, Math.max(0.6, s))

  const darkBg = formatHex({ mode: 'hsl', h, s: Math.min(0.18, s), l: 0.06 }) ?? '#0B0B0F'
  const lightBg = formatHex({ mode: 'hsl', h, s: Math.min(0.25, s), l: 0.97 }) ?? '#FFFFFF'

  const prefersDark = DARK_CANVAS.includes(styleId)
  let background = prefersDark
    ? darkBg
    : styleId === 'warm_handmade'
      ? '#F4ECDD'
      : lightBg

  // Guard 1: if the naive choice is illegible, flip light/dark.
  if (wcagContrast(primary, background) < 4.5) {
    background = prefersDark ? lightBg : darkBg
  }
  // Guard 2: last resort — pure white or near-black, whichever reads better.
  if (wcagContrast(primary, background) < 4.5) {
    background =
      wcagContrast(primary, '#FFFFFF') >= wcagContrast(primary, '#0B0B0F')
        ? '#FFFFFF'
        : '#0B0B0F'
  }

  // Accent contrast guard: darken (on light bg) or lighten (on dark bg) the
  // accent — preserving its hue/saturation pop — until it reads >=4.5:1 as text
  // on the background. Falls back to the most legible endpoint if no step works.
  const accent = ensureAccentContrast(accentHue, accentSat, background)

  return { primary, accent, background }
}

const TARGET_CONTRAST = 4.5

function ensureAccentContrast(hue: number, sat: number, background: string): string {
  const bgL = toHsl(parse(background))?.l ?? 1
  const darken = bgL >= 0.5 // light background → push accent darker
  const at = (l: number) =>
    formatHex({ mode: 'hsl', h: hue, s: sat, l: Math.min(0.95, Math.max(0.05, l)) }) ?? '#FF6B6B'

  let best = at(0.55)
  let bestContrast = wcagContrast(best, background)
  // Walk lightness toward the legible end in small steps; take the first pass,
  // otherwise remember the highest-contrast candidate seen.
  for (let step = 1; step <= 11; step++) {
    const l = darken ? 0.55 - step * 0.05 : 0.55 + step * 0.04
    const candidate = at(l)
    const c = wcagContrast(candidate, background)
    if (c >= TARGET_CONTRAST) return candidate
    if (c > bestContrast) {
      best = candidate
      bestContrast = c
    }
  }
  return best
}
