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

  // Accent: complementary hue, saturated mid-tone pop.
  const accent = formatHex({
    mode: 'hsl',
    h: (h + 150) % 360,
    s: Math.min(0.9, Math.max(0.6, s)),
    l: 0.55,
  }) ?? '#FF6B6B'

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

  return { primary, accent, background }
}
