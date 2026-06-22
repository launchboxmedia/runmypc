import { describe, it, expect } from 'vitest'
import { extractHtml, stripGlyphPlaceholders } from './slideHtml'
import { sniffMediaType } from './scoreVisual'

describe('stripGlyphPlaceholders', () => {
  it('removes a wrapping element whose text is the NO GLYPH placeholder', () => {
    const html = '<div class="icon"><span>NO GLYPH</span></div><p>keep</p>'
    const out = stripGlyphPlaceholders(html)
    expect(out).not.toMatch(/glyph/i)
    expect(out).toContain('keep')
  })
  it('scrubs stray hyphenated/spaced variants', () => {
    expect(stripGlyphPlaceholders('a no-glyph b NO_GLYPH c no glyph')).toBe('a  b  c ')
  })
  it('leaves clean html untouched', () => {
    expect(stripGlyphPlaceholders('<h1>Speed up</h1>')).toBe('<h1>Speed up</h1>')
  })
})

describe('extractHtml', () => {
  it('unwraps a ```html fenced block', () => {
    const raw = 'Sure!\n```html\n<!doctype html><html><body>x</body></html>\n```\nDone'
    expect(extractHtml(raw)).toBe('<!doctype html><html><body>x</body></html>')
  })
  it('extracts <html>…</html> from surrounding prose (no fence)', () => {
    const raw = 'Here you go: <html><body>y</body></html> hope that helps'
    expect(extractHtml(raw)).toBe('<html><body>y</body></html>')
  })
  it('returns trimmed input when already clean', () => {
    const raw = '  <!doctype html><html></html>  '
    expect(extractHtml(raw)).toBe('<!doctype html><html></html>')
  })
})

describe('sniffMediaType', () => {
  it('detects PNG', () => {
    expect(sniffMediaType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe('image/png')
  })
  it('detects JPEG', () => {
    expect(sniffMediaType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
  })
  it('detects WebP', () => {
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')])
    expect(sniffMediaType(webp)).toBe('image/webp')
  })
  it('defaults to PNG for unknown', () => {
    expect(sniffMediaType(Buffer.from([0x00, 0x01, 0x02]))).toBe('image/png')
  })
})
