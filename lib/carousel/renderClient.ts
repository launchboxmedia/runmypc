// Client for the Phase B static-frame render mode of the hyperframes-render
// service. POSTs HTML with render_mode:"static" and returns the rendered PNG as
// a Buffer. The service owns typography (bundled fonts); HTML must embed any
// image as a data-URI (the render lambda has no guaranteed network egress).

const DEFAULT_WIDTH = 1080
const DEFAULT_HEIGHT = 1350 // 4:5 portrait

export async function renderStaticPng(
  html: string,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT
): Promise<Buffer> {
  const url = process.env.HYPERFRAMES_RENDER_URL
  if (!url) throw new Error('HYPERFRAMES_RENDER_URL not configured')

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ render_mode: 'static', html, width, height }),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`Static render failed (${res.status}): ${err.slice(0, 300)}`)
  }

  const data = (await res.json()) as { url?: string; error?: string }
  if (!data.url) throw new Error(`Static render returned no url: ${data.error || 'unknown'}`)

  const pngRes = await fetch(data.url)
  if (!pngRes.ok) throw new Error(`Failed to fetch rendered PNG (${pngRes.status})`)
  return Buffer.from(await pngRes.arrayBuffer())
}
