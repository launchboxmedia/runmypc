// Local-only debug interception. Writes the last generation payload + a still
// render frame to .debug_logs/ for agent/developer inspection.
//
// NEVER active in production: serverless filesystems are read-only outside /tmp,
// so writes are gated to `next dev` (NODE_ENV==='development') or an explicit
// CAROUSEL_DEBUG=1 flag. Every write is wrapped — debug logging must never break
// a generation run.
import { promises as fs } from 'fs'
import path from 'path'

const DEBUG_DIR = path.join(process.cwd(), '.debug_logs')

export function debugEnabled(): boolean {
  return process.env.NODE_ENV === 'development' || process.env.CAROUSEL_DEBUG === '1'
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(DEBUG_DIR, { recursive: true })
}

// Data interception: the validated beats payload from generateCarouselBeats.
export async function logGenerationPayload(beats: unknown): Promise<void> {
  if (!debugEnabled()) return
  try {
    await ensureDir()
    await fs.writeFile(
      path.join(DEBUG_DIR, 'latest_generation_payload.json'),
      JSON.stringify(beats, null, 2),
      'utf8'
    )
  } catch (e) {
    console.warn('[debugLogger] payload write failed:', e instanceof Error ? e.message : e)
  }
}

// Visual interception: a rendered still frame (PNG buffer from renderStaticPng).
// Named latest_render.png — slides ship as MP4 video; the still is a poster frame
// produced by the render service's static mode, not a video frame extraction.
export async function logRenderFrame(buffer: Buffer): Promise<void> {
  if (!debugEnabled()) return
  try {
    await ensureDir()
    await fs.writeFile(path.join(DEBUG_DIR, 'latest_render.png'), buffer)
  } catch (e) {
    console.warn('[debugLogger] render write failed:', e instanceof Error ? e.message : e)
  }
}
