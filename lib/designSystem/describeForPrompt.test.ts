import { describe, it, expect } from 'vitest'
import { describeDesignSystem } from './describeForPrompt'
import { STYLE_LIBRARY, type StyleId } from './styleLibrary'
import type { ResolvedDesignSystem } from './resolveDesignSystem'

const base: ResolvedDesignSystem = {
  style_id: 'bold_personal',
  source: 'job_override',
  primary_color: '#FFFFFF',
  accent: '#FF3B30',
  background: '#0B0B0F',
  split_image_cover: false,
}

describe('describeDesignSystem', () => {
  it('includes the style display name and all three palette hexes', () => {
    const out = describeDesignSystem(base)
    expect(out).toContain(STYLE_LIBRARY.bold_personal.display_name)
    expect(out).toContain('#FFFFFF')
    expect(out).toContain('#FF3B30')
    expect(out).toContain('#0B0B0F')
  })

  it('includes the style typography treatment', () => {
    const out = describeDesignSystem(base)
    expect(out).toContain(STYLE_LIBRARY.bold_personal.typography.treatment)
  })

  it('is deterministic for a fixed input', () => {
    expect(describeDesignSystem(base)).toBe(describeDesignSystem(base))
  })

  it('runs for every style id without throwing', () => {
    const ids = Object.keys(STYLE_LIBRARY) as StyleId[]
    for (const id of ids) {
      const out = describeDesignSystem({ ...base, style_id: id })
      expect(out.length).toBeGreaterThan(20)
      expect(out).toContain(STYLE_LIBRARY[id].display_name)
    }
  })
})
