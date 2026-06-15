const archiver = require('archiver')

export async function createAssetsZip(outputs: Array<{
  label: string
  url?: string | null
  content?: string | null
  output_type: string
  platform?: string | null
}>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } })
    const chunks: Buffer[] = []

    archive.on('data', (chunk: Buffer) => chunks.push(chunk))
    archive.on('end', () => resolve(Buffer.concat(chunks)))
    archive.on('error', reject)

    for (const output of outputs) {
      if (output.content) {
        const filename = `${output.platform || output.output_type}/${output.label}.txt`
        archive.append(output.content, { name: filename })
      }
    }

    const urlOutputs = outputs.filter(o => o.url)
    if (urlOutputs.length > 0) {
      const manifest = urlOutputs.map(o => `${o.label}: ${o.url}`).join('\n')
      archive.append(manifest, { name: 'links.txt' })
    }

    archive.finalize()
  })
}
