import { describe, it, expect, vi } from 'vitest'
import { checkSlide } from './qualityGate'
import type { CarouselBeat } from './types'

const DUMMY_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const HOOK_BEAT: CarouselBeat = {
  beat: 'hook',
  isCover: true,
  index: 0,
  title: 'Your Credit Report Is Lying to You',
}

const CTA_BEAT: CarouselBeat = {
  beat: 'cta',
  isCover: false,
  index: 5,
  title: 'Follow Us for the Breakdown',
  bottomAnchor: 'Start today',
}

describe('checkSlide', () => {
  it('returns pass when vision says pass', async () => {
    const deps = { vision: vi.fn().mockResolvedValue({ pass: true, issues: '' }) }
    const result = await checkSlide(DUMMY_PNG, HOOK_BEAT, deps)
    expect(result.pass).toBe(true)
    expect(result.issues).toBe('')
  })

  it('returns fail with issues when vision says fail', async () => {
    const deps = { vision: vi.fn().mockResolvedValue({ pass: false, issues: 'CTA text rotated 90deg, illegible' }) }
    const result = await checkSlide(DUMMY_PNG, CTA_BEAT, deps)
    expect(result.pass).toBe(false)
    expect(result.issues).toContain('rotated')
  })

  it('fails open (pass=true) on vision error', async () => {
    const deps = { vision: vi.fn().mockRejectedValue(new Error('vision API down')) }
    const result = await checkSlide(DUMMY_PNG, HOOK_BEAT, deps)
    expect(result.pass).toBe(true)
  })

  it('calls vision with beat context', async () => {
    const mockVision = vi.fn().mockResolvedValue({ pass: true, issues: '' })
    const deps = { vision: mockVision }
    await checkSlide(DUMMY_PNG, CTA_BEAT, deps)
    expect(mockVision).toHaveBeenCalledWith(DUMMY_PNG, CTA_BEAT)
  })
})
