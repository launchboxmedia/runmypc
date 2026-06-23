// Inline font dictionary for carousel slides.
// Stubs are architecture placeholders — replace each value with a real WOFF2
// base64 string before production (generate with: base64 -w 0 Font.woff2).
// FONT_DICT lives here (not in slideHtml.ts) to isolate the large blob from
// generation logic when real strings are dropped in.
export const FONT_DICT: Record<string, string> = {
  'Playfair Display': 'AAEC', // stub — replace with real Playfair Display WOFF2 base64
  'Inter':            'AAEC', // stub — replace with real Inter WOFF2 base64
  'Anton':            'AAEC',
  'Montserrat':       'AAEC',
  'Fredoka':          'AAEC',
  'Kalam':            'AAEC',
  'Archivo':          'AAEC',
}

// Generates @font-face declarations for the named fonts that have entries in
// FONT_DICT. Unknown font names are silently skipped (falls back to system font).
export function buildFontFaceBlock(fontNames: string[]): string {
  return fontNames
    .filter(f => FONT_DICT[f])
    .map(f =>
      `@font-face{font-family:'${f}';src:url('data:font/woff2;base64,${FONT_DICT[f]}') format('woff2');font-weight:100 900;font-style:normal;font-display:block;}`
    )
    .join('\n')
}
