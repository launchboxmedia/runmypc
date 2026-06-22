import { describe, it, expect } from 'vitest'
import { STYLE_LIBRARY, STYLE_LIST, type StyleId } from './styleLibrary'

const IDS: StyleId[] = ['bold_personal', 'clean_direct', 'warm_handmade', 'sharp_professional', 'premium_editorial']
const HEX = /^#[0-9a-fA-F]{6}$/

describe('STYLE_LIBRARY', () => {
  it('has exactly the 5 styles, ordered, in both shapes', () => {
    expect(STYLE_LIST.map(s => s.id)).toEqual(IDS)
    expect(Object.keys(STYLE_LIBRARY).sort()).toEqual([...IDS].sort())
  })

  it('every descriptor has all required fields populated', () => {
    for (const s of STYLE_LIST) {
      expect(s.display_name.length).toBeGreaterThan(0)
      expect(s.description.length).toBeGreaterThan(0)
      expect(s.preview_image_url.length).toBeGreaterThan(0)
      expect(s.typography.display_font.length).toBeGreaterThan(0)
      expect(s.typography.body_font.length).toBeGreaterThan(0)
      expect(s.typography.treatment.length).toBeGreaterThan(0)
      expect(s.layout_descriptor.length).toBeGreaterThan(0)
      expect(s.hook_technique.length).toBeGreaterThan(0)
    }
  })

  it('implied_tone matches the locked palettes', () => {
    for (const s of STYLE_LIST) {
      expect(s.implied_tone.primary).toMatch(HEX)
      expect(s.implied_tone.accent).toMatch(HEX)
      expect(s.implied_tone.background).toMatch(HEX)
    }
    expect(STYLE_LIBRARY.bold_personal.implied_tone).toEqual({ background: '#0B0B0F', primary: '#FFFFFF', accent: '#FF3B30' })
    expect(STYLE_LIBRARY.clean_direct.implied_tone).toEqual({ background: '#FFFFFF', primary: '#111827', accent: '#2563EB' })
    expect(STYLE_LIBRARY.warm_handmade.implied_tone).toEqual({ background: '#F4ECDD', primary: '#4A3728', accent: '#E08A3C' })
    expect(STYLE_LIBRARY.sharp_professional.implied_tone).toEqual({ background: '#0F172A', primary: '#F8FAFC', accent: '#38BDF8' })
    expect(STYLE_LIBRARY.premium_editorial.implied_tone).toEqual({ background: '#F7F5F1', primary: '#141414', accent: '#7A5C3E' })
  })
})
