import { describe, it, expect, vi, beforeEach } from 'vitest'

// Record every table touched through the admin client.
const touchedTables: string[] = []
const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      touchedTables.push(table)
      return { update: updateMock }
    },
  }),
}))

import { persistJobStyle } from './persistJobStyle'
import type { ResolvedDesignSystem } from './resolveDesignSystem'

const resolved: ResolvedDesignSystem = {
  style_id: 'clean_direct',
  source: 'haiku_inferred',
  primary_color: '#111827',
  accent: '#2563EB',
  background: '#FFFFFF',
  split_image_cover: false,
}

describe('persistJobStyle', () => {
  beforeEach(() => {
    touchedTables.length = 0
    updateMock.mockClear()
  })

  it('writes the jobs table and NEVER the profiles table', async () => {
    await persistJobStyle('job-123', resolved)
    expect(touchedTables).toContain('jobs')
    expect(touchedTables).not.toContain('profiles')
  })

  it('persists style_id, primary_color and split_image_cover', async () => {
    await persistJobStyle('job-123', resolved)
    expect(updateMock).toHaveBeenCalledWith({
      style_id: 'clean_direct',
      primary_color: '#111827',
      split_image_cover: false,
    })
  })
})
