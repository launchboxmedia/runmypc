import sharp from 'sharp'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'

// Usage: node scripts/contact-sheet.mjs [sourceDir] [outFile]
// sourceDir: either tmp/hero-benchmark (per-case subdirs w/ rendered-output.png)
//            or a flat dir of <id>.png files (e.g. tmp/ab-test/A)
const root = resolve(process.cwd(), process.argv[2] ?? 'tmp/hero-benchmark')
const outFile = resolve(process.cwd(), process.argv[3] ?? resolve(root, 'contact-sheet.png'))

const entries = readdirSync(root, { withFileTypes: true })
const subdirs = entries.filter((d) => d.isDirectory()).map((d) => d.name).sort()
const isFlat = subdirs.length === 0

const cases = isFlat
  ? entries.filter((d) => d.isFile() && d.name.endsWith('.png')).map((d) => d.name.replace(/\.png$/, '')).sort()
  : subdirs

const THUMB_W = 270
const THUMB_H = 338
const LABEL_H = 40
const CELL_H = THUMB_H + LABEL_H
const cols = cases.length

const thumbs = await Promise.all(
  cases.map((id) =>
    sharp(isFlat ? resolve(root, `${id}.png`) : resolve(root, id, 'rendered-output.png'))
      .resize(THUMB_W, THUMB_H)
      .toBuffer(),
  ),
)

const labelsSvg = `<svg width="${THUMB_W * cols}" height="${LABEL_H}">
  <rect width="100%" height="100%" fill="#111"/>
  ${cases.map((id, i) => `<text x="${i * THUMB_W + THUMB_W / 2}" y="26" font-family="sans-serif" font-size="20" fill="white" text-anchor="middle">${id}</text>`).join('')}
</svg>`

const sheet = sharp({
  create: { width: THUMB_W * cols, height: CELL_H, channels: 3, background: '#111' },
})

const composites = [
  { input: Buffer.from(labelsSvg), left: 0, top: 0 },
  ...thumbs.map((buf, i) => ({ input: buf, left: i * THUMB_W, top: LABEL_H })),
]

await sheet.composite(composites).png().toFile(outFile)
console.log(`wrote ${outFile} (${cols} cases)`)
