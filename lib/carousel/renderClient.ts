// Client for the Phase B static-frame render mode of the hyperframes-render
// service. POSTs HTML with render_mode:"static" and returns the rendered PNG as
// a Buffer. The service owns typography (bundled fonts); HTML must embed any
// image as a data-URI (the render lambda has no guaranteed network egress).

const DEFAULT_WIDTH = 1080
const DEFAULT_HEIGHT = 1350 // 4:5 portrait

const DEFAULT_TIMEOUT_MS = 60000
const MAX_RENDER_ATTEMPTS = 3 // 1 + 2 retries on transient failures

// The render lambda occasionally 500s transiently (e.g. "spawn ETXTBSY" — the
// Chromium binary busy under concurrency) or times out. Retry those with a short
// backoff so a single flaky render doesn't sink the whole carousel. 4xx (bad
// request) is not retried.
export async function renderStaticPng(
  html: string,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Buffer> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= MAX_RENDER_ATTEMPTS; attempt++) {
    try {
      return await renderOnce(html, width, height, timeoutMs)
    } catch (e) {
      lastErr = e
      if (!isTransient(e) || attempt === MAX_RENDER_ATTEMPTS) throw e
      await new Promise(r => setTimeout(r, 400 * attempt)) // 400ms, 800ms
    }
  }
  throw lastErr
}

// A render failure worth retrying: a 5xx response, a timeout, or a network error
// (but never a 4xx bad-request — that won't fix itself).
function isTransient(e: unknown): boolean {
  if (!(e instanceof Error)) return false
  if (/timed out/i.test(e.message)) return true
  const m = e.message.match(/render failed \((\d{3})\)/i)
  if (m) return Number(m[1]) >= 500
  // Bare fetch/network errors carry no status — treat as transient.
  return !/render returned no url|failed to fetch rendered png \(4\d\d\)/i.test(e.message)
}

async function renderOnce(
  html: string,
  width: number,
  height: number,
  timeoutMs: number
): Promise<Buffer> {
  const url = process.env.HYPERFRAMES_RENDER_URL
  if (!url) throw new Error('HYPERFRAMES_RENDER_URL not configured')

  // Abortable timeout so a stuck lambda fails fast instead of hanging the job.
  const fetchSignal = () => AbortSignal.timeout(timeoutMs)

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ render_mode: 'static', html, width, height }),
      signal: fetchSignal(),
    })
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') throw new Error(`Static render timed out after ${timeoutMs}ms`)
    throw e
  }

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`Static render failed (${res.status}): ${err.slice(0, 300)}`)
  }

  const data = (await res.json()) as { url?: string; error?: string }
  if (!data.url) throw new Error(`Static render returned no url: ${data.error || 'unknown'}`)

  let pngRes: Response
  try {
    pngRes = await fetch(data.url, { signal: fetchSignal() })
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') throw new Error(`Rendered PNG fetch timed out after ${timeoutMs}ms`)
    throw e
  }
  if (!pngRes.ok) throw new Error(`Failed to fetch rendered PNG (${pngRes.status})`)
  return Buffer.from(await pngRes.arrayBuffer())
}

// Animated render: drives GSAP timeline frame-by-frame, returns MP4 Buffer.
// Duration and fps must match the HTML's data-duration attribute.
export async function renderAnimatedSlide(
  html: string,
  width = 1080,
  height = 1350,
  durationSeconds = 3,
  fps = 30,
  timeoutMs = 120000
): Promise<Buffer> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= MAX_RENDER_ATTEMPTS; attempt++) {
    try {
      return await renderAnimatedOnce(html, width, height, durationSeconds, fps, timeoutMs)
    } catch (e) {
      lastErr = e
      if (!isTransient(e) || attempt === MAX_RENDER_ATTEMPTS) throw e
      await new Promise(r => setTimeout(r, 400 * attempt))
    }
  }
  throw lastErr
}

async function renderAnimatedOnce(
  html: string,
  width: number,
  height: number,
  durationSeconds: number,
  fps: number,
  timeoutMs: number
): Promise<Buffer> {
  const url = process.env.HYPERFRAMES_RENDER_URL
  if (!url) throw new Error('HYPERFRAMES_RENDER_URL not configured')

  const fetchSignal = () => AbortSignal.timeout(timeoutMs)

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html, width, height, fps, durationInSeconds: durationSeconds }),
      signal: fetchSignal(),
    })
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') throw new Error(`Animated render timed out after ${timeoutMs}ms`)
    throw e
  }

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`Animated render failed (${res.status}): ${err.slice(0, 300)}`)
  }

  const data = (await res.json()) as { url?: string; error?: string }
  if (!data.url) throw new Error(`Animated render returned no url: ${data.error || 'unknown'}`)

  let mp4Res: Response
  try {
    mp4Res = await fetch(data.url, { signal: fetchSignal() })
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') throw new Error(`Rendered MP4 fetch timed out after ${timeoutMs}ms`)
    throw e
  }
  if (!mp4Res.ok) throw new Error(`Failed to fetch rendered MP4 (${mp4Res.status})`)
  return Buffer.from(await mp4Res.arrayBuffer())
}
