// One-off backfill: existing job_outputs rows store broken /object/public/job-assets/
// URLs (private bucket). Extract the storage path from each and populate
// metadata.storage_path (+ slide_paths for carousels) so read-time signed URLs work.
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')

const supabase = createClient(url, key)

const MARKER = '/object/public/job-assets/'

// Extract storage path from a public URL; strip any query string. Returns null if not a job-assets public URL.
function pathFromUrl(u) {
  if (typeof u !== 'string') return null
  const i = u.indexOf(MARKER)
  if (i === -1) return null
  return decodeURIComponent(u.slice(i + MARKER.length).split('?')[0])
}

const { data: rows, error } = await supabase
  .from('job_outputs')
  .select('id, url, metadata')

if (error) throw error

let updated = 0
let skipped = 0

for (const row of rows) {
  const meta = { ...(row.metadata || {}) }
  let changed = false

  // Single-asset path
  if (!meta.storage_path) {
    const p = pathFromUrl(row.url)
    if (p) {
      meta.storage_path = p
      changed = true
    }
  }

  // Carousel slide paths
  if (!meta.slide_paths && Array.isArray(meta.slide_urls)) {
    const paths = meta.slide_urls.map(pathFromUrl).filter(Boolean)
    if (paths.length) {
      meta.slide_paths = paths
      if (!meta.storage_path) meta.storage_path = paths[0]
      changed = true
    }
  }

  if (!changed) { skipped++; continue }

  const { error: upErr } = await supabase
    .from('job_outputs')
    .update({ metadata: meta })
    .eq('id', row.id)

  if (upErr) { console.error('update failed', row.id, upErr.message); continue }
  updated++
}

console.log(`backfill done: ${updated} updated, ${skipped} skipped, ${rows.length} total`)
