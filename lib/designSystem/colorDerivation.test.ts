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
})
