import { describe, it, expect } from 'vitest'
import { FONT_DICT, buildFontFaceBlock } from './fonts'

// Every display_font referenced by styleLibrary.ts must resolve to a real
// embedded face — otherwise the renderer silently falls back to whatever
// generic sans-serif the host happens to have, which is non-deterministic
// across environments (see ADR-0001 addendum).
const STYLE_DISPLAY_FONTS = ['Anton', 'Montserrat', 'Fredoka', 'Archivo', 'Playfair Display']

describe('FONT_DICT — style display fonts are embedded', () => {
  it.each(STYLE_DISPLAY_FONTS)('%s has at least one FONT_DICT entry', (family) => {
    const hasEntry = Object.keys(FONT_DICT).some((k) => k === family || k.startsWith(`${family} `))
    expect(hasEntry).toBe(true)
  })
})

describe('buildFontFaceBlock', () => {
  it('emits an @font-face rule for a known font', () => {
    const block = buildFontFaceBlock(['Anton'])
    expect(block).toContain("@font-face{font-family:'Anton'")
    expect(block).toContain("format('woff2')")
  })

  it('emits rules for every requested weight bucket of a multi-entry family', () => {
    const block = buildFontFaceBlock(['Anton', 'Anton Bold'])
    expect(block).toContain('font-weight:100 700')
    expect(block).toContain('font-weight:700 900')
  })

  it('silently skips a name with no FONT_DICT entry', () => {
    expect(buildFontFaceBlock(['Nonexistent Font'])).toBe('')
  })
})
