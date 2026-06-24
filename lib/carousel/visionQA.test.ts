import { describe, it, expect, vi } from 'vitest'
import { runVisionQA, parseVerdict, VISION_QA_SYSTEM } from './visionQA'

describe('parseVerdict', () => {
  it('parses a PASS verdict', () => {
    expect(parseVerdict('{"status":"PASS","reason":"legible"}')).toEqual({ status: 'PASS', reason: 'legible' })
  })

  it('parses a FAIL verdict', () => {
    expect(parseVerdict('{"status":"FAIL","reason":"text clipped"}')).toEqual({ status: 'FAIL', reason: 'text clipped' })
  })

  it('extracts JSON from surrounding prose', () => {
    expect(parseVerdict('Here is the verdict: {"status":"FAIL","reason":"low contrast"} done').status).toBe('FAIL')
  })

  it('fails open on unparseable output', () => {
    expect(parseVerdict('totally not json').status).toBe('PASS')
  })

  it('treats any non-FAIL status as PASS', () => {
    expect(parseVerdict('{"status":"weird","reason":"x"}').status).toBe('PASS')
  })
})

describe('runVisionQA', () => {
  it('accepts a Buffer and returns the parsed verdict', async () => {
    const analyze = vi.fn().mockResolvedValue('{"status":"PASS","reason":"ok"}')
    const verdict = await runVisionQA(Buffer.from('fakepng'), { analyze })
    expect(verdict).toEqual({ status: 'PASS', reason: 'ok' })
    // Buffer must be passed as a data-URI
    expect(analyze).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/png;base64,/), VISION_QA_SYSTEM)
  })

  it('passes a URL string through unchanged', async () => {
    const analyze = vi.fn().mockResolvedValue('{"status":"FAIL","reason":"bad"}')
    await runVisionQA('https://cdn.example.com/cover.png', { analyze })
    expect(analyze).toHaveBeenCalledWith('https://cdn.example.com/cover.png', VISION_QA_SYSTEM)
  })

  it('fails open when the analyzer throws', async () => {
    const analyze = vi.fn().mockRejectedValue(new Error('429 rate limit'))
    const verdict = await runVisionQA(Buffer.from('x'), { analyze })
    expect(verdict.status).toBe('PASS')
    expect(verdict.reason).toMatch(/qa-skipped/)
  })
})
