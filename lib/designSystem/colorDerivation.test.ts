import { describe, it, expect } from 'vitest'
import { wcagContrast } from 'culori'
import { derivePalette } from './colorDerivation'

const HEX = /^#[0-9a-fA-F]{6}$/

describe('derivePalette', () => {
  it('echoes a normalized primary and returns valid hex triad', () => {
    const p = derivePalette('clean_direct', '#111827')
    expect(p.primary).toMatch(HEX)
    expect(p.accent).toMatch(HEX)
    expect(p.background).toMatch(HEX)
  })

  it('light-canvas style yields a light background readable against the primary', () => {
    const p = derivePalette('clean_direct', '#111827')
    expect(wcagContrast(p.primary, p.background)).toBeGreaterThanOrEqual(4.5)
  })

  it('dark-canvas style yields a dark background readable against a light primary', () => {
    const p = derivePalette('bold_personal', '#FFFFFF')
    expect(wcagContrast(p.primary, p.background)).toBeGreaterThanOrEqual(4.5)
  })

  it('contrast guard flips the background when the naive choice would be illegible', () => {
    const p = derivePalette('bold_personal', '#0B0B0F')
    expect(wcagContrast(p.primary, p.background)).toBeGreaterThanOrEqual(4.5)
  })

  it('falls back to a default primary for an unparseable color', () => {
    const p = derivePalette('clean_direct', 'not-a-color')
    expect(p.primary).toMatch(HEX)
    expect(wcagContrast(p.primary, p.background)).toBeGreaterThanOrEqual(4.5)
  })

  // Accent must be legible as text on the background — previously unguarded, the
  // fixed l:0.55 accent landed at ~3.4:1 on light canvases (the low-contrast
  // comparison-label bug). Guard it on every style for any customer color.
  it('accent is legible (>=4.5:1) against the background on light-canvas styles', () => {
    for (const style of ['clean_direct', 'premium_editorial'] as const) {
      for (const primary of ['#2563EB', '#E11D48', '#0EA5E9', '#16A34A']) {
        const p = derivePalette(style, primary)
        expect(wcagContrast(p.accent, p.background)).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('accent is legible (>=4.5:1) against the background on dark-canvas styles', () => {
    for (const style of ['bold_personal', 'sharp_professional'] as const) {
      for (const primary of ['#FFFFFF', '#2563EB', '#F59E0B']) {
        const p = derivePalette(style, primary)
        expect(wcagContrast(p.accent, p.background)).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('keeps the accent a distinct pop hue, not collapsed onto the primary', () => {
    const p = derivePalette('clean_direct', '#2563EB')
    expect(p.accent.toLowerCase()).not.toBe(p.primary.toLowerCase())
  })
})
