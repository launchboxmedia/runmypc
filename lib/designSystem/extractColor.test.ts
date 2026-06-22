import { describe, it, expect } from 'vitest'
import { parse, converter } from 'culori'
import { extractDominantColor } from './extractColor'

// Solid warm-amber (#E08A3C) 8x8 PNG.
const AMBER_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGN40GWDFTEMLQkAYi9pgTk2WH4AAAAASUVORK5CYII='

const toRgb = converter('rgb')

describe('extractDominantColor', () => {
  it('returns a valid hex for a solid warm image and reads warm (R > B)', async () => {
    const buf = Buffer.from(AMBER_PNG_B64, 'base64')
    const hex = await extractDominantColor(buf)
    expect(hex).toMatch(/^#[0-9a-fA-F]{6}$/)
    const rgb = toRgb(parse(hex))!
    expect(rgb.r).toBeGreaterThan(rgb.b) // warm
  })
})
