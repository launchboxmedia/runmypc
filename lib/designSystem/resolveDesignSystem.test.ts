import { describe, it, expect, vi } from 'vitest'
import { resolveDesignSystem, type ResolveDeps } from './resolveDesignSystem'
import { STYLE_LIBRARY } from './styleLibrary'

const job = { topic: 'productivity', target_audience: 'founders', outcome: 'ship faster' }
const stubDeps = (id: any = 'warm_handmade'): ResolveDeps => ({
  classifyStyle: vi.fn().mockResolvedValue(id),
})

describe('resolveDesignSystem', () => {
  it('uses the job override first (source = job_override)', async () => {
    const deps = stubDeps()
    const r = await resolveDesignSystem(
      { job: { ...job, style_id: 'bold_personal', primary_color: '#FFFFFF' }, profile: { style_id: 'clean_direct', primary_color: '#000000' } },
      deps
    )
    expect(r.style_id).toBe('bold_personal')
    expect(r.source).toBe('job_override')
    expect(deps.classifyStyle).not.toHaveBeenCalled()
  })

  it('falls back to profile default (source = profile_default)', async () => {
    const deps = stubDeps()
    const r = await resolveDesignSystem(
      { job, profile: { style_id: 'clean_direct', primary_color: '#111827' } },
      deps
    )
    expect(r.style_id).toBe('clean_direct')
    expect(r.source).toBe('profile_default')
    expect(deps.classifyStyle).not.toHaveBeenCalled()
  })

  it('infers via Haiku when neither is set (source = haiku_inferred)', async () => {
    const deps = stubDeps('premium_editorial')
    const r = await resolveDesignSystem({ job, profile: null }, deps)
    expect(r.style_id).toBe('premium_editorial')
    expect(r.source).toBe('haiku_inferred')
    expect(deps.classifyStyle).toHaveBeenCalledOnce()
  })

  it('uses implied_tone triad verbatim when no color is set anywhere', async () => {
    const r = await resolveDesignSystem({ job: { ...job, style_id: 'sharp_professional' }, profile: null }, stubDeps())
    expect({ primary: r.primary_color, accent: r.accent, background: r.background }).toEqual(
      STYLE_LIBRARY.sharp_professional.implied_tone
    )
  })

  it('split_image_cover order: job > profile > false', async () => {
    expect((await resolveDesignSystem({ job: { ...job, style_id: 'clean_direct', split_image_cover: true }, profile: { split_image_cover: false } }, stubDeps())).split_image_cover).toBe(true)
    expect((await resolveDesignSystem({ job: { ...job, style_id: 'clean_direct' }, profile: { split_image_cover: true } }, stubDeps())).split_image_cover).toBe(true)
    expect((await resolveDesignSystem({ job: { ...job, style_id: 'clean_direct' }, profile: null }, stubDeps())).split_image_cover).toBe(false)
  })

  it('treats an invalid stored style_id as unset (falls through)', async () => {
    const deps = stubDeps('warm_handmade')
    const r = await resolveDesignSystem({ job: { ...job, style_id: 'bogus' }, profile: null }, deps)
    expect(r.source).toBe('haiku_inferred')
    expect(r.style_id).toBe('warm_handmade')
  })
})
