require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const client = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function test() {
  const { data, error } = await client.from('jobs').insert({
    user_id: 'd3175dae-3a6f-4789-9f28-ab93adce47a6',
    topic: 'Test Topic',
    mode: 'content_only',
    status: 'queued',
    current_phase: 'content_generation'
  }).select('id')

  if (error) {
    console.log('Error:', JSON.stringify(error, null, 2))
  } else {
    console.log('Success! Job ID:', data[0].id)
  }
}

test()
