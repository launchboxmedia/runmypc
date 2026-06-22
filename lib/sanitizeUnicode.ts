// Guard against unpaired UTF-16 surrogates reaching JSON-encoded API requests.
// Slicing a string at an arbitrary index (e.g. truncating an emoji-laden scraped
// caption) can split a surrogate pair, leaving a lone surrogate. The Anthropic
// API rejects such bodies: 400 "no low surrogate in string". These helpers strip
// lone surrogates and clip safely.

// Remove any surrogate code unit that is not part of a valid pair.
export function stripLoneSurrogates(input: string): string {
  return String(input ?? '')
    // high surrogate NOT followed by a low surrogate
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
    // low surrogate NOT preceded by a high surrogate
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
}

// Truncate to at most `n` UTF-16 units, then strip any surrogate split created
// at the boundary. Coerces non-string input to a string first.
export function clip(input: string, n: number): string {
  return stripLoneSurrogates(String(input ?? '').slice(0, n))
}
