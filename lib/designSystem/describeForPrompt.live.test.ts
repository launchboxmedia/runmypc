// LIVE spot-check (RUN_LIVE=1): generates ONE static creative through the Phase D
// design-system prompt so the palette/aesthetic cohesion can be eyeballed. Also
// asserts the fragment is embeddable in a cinematic-style prompt.
//   RUN_LIVE=1 npx vitest run lib/designSystem/describeForPrompt.live.test.ts
import { describe, it, expect } from 'vitest'
import { config as loadEnv } from 'dotenv'
import { resolve } from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { describeDesignSystem } from './describeForPrompt'
import { derivePalette } from './colorDerivation'
import type { ResolvedDesignSystem } from './resolveDesignSystem'

loadEnv({ path: resolve(process.cwd(), '.env.local') })
const LIVE = process.env.RUN_LIVE === '1'

describe.skipIf(!LIVE)('describeDesignSystem (LIVE cohesion)', () => {
  it('produces a static creative that tracks the resolved palette/style', async () => {
    const style = 'premium_editorial' as const
    const { primary, accent, background } = derivePalette(style, '#2563EB')
    const resolved: ResolvedDesignSystem = {
      style_id: style, source: 'job_override', primary_color: primary, accent, background, split_image_cover: false,
    }
    const fragment = describeDesignSystem(resolved)

    const prompt = `Professional social media creative for Instagram. Topic: speed up a slow Windows PC. Target audience: everyday PC owners. ${fragment} Clean, bold, scroll-stopping, illustrative (not a fake screenshot).`
    const { generateImage } = await import('@/lib/atlascloud')
    const { url } = await generateImage({ prompt })

    const res = await fetch(url)
    const buf = Buffer.from(await res.arrayBuffer())
    const dir = resolve(process.cwd(), 'tmp', 'phase-d-verify')
    mkdirSync(dir, { recursive: true })
    const p = resolve(dir, `static-${style}.png`)
    writeFileSync(p, buf)
    console.log('WROTE', p, `${buf.length} bytes`, '| palette', { primary, accent, background })

    expect(buf.length).toBeGreaterThan(1000)
  }, 300_000)

  it('fragment embeds into a cinematic prompt string', () => {
    const resolved: ResolvedDesignSystem = {
      style_id: 'bold_personal', source: 'job_override',
      primary_color: '#FFFFFF', accent: '#FF3B30', background: '#0B0B0F', split_image_cover: false,
    }
    const fragment = describeDesignSystem(resolved)
    const prompt = `A bold, modern cinematic vertical video about: X.\n${fragment}\nNo text overlay.`
    expect(prompt).toContain(fragment)
    expect(prompt).toContain('#FF3B30')
  })
})
