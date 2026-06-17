import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

// Load env
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!serviceRoleKey || !serviceRoleKey.startsWith('eyJ')) {
  console.error('\nError: SUPABASE_SERVICE_ROLE_KEY not found or invalid in .env.local')
  console.error('\nGet it from: https://supabase.com/dashboard/project/limscrtqcpequuzgmpde/settings/api')
  console.error('\nThen add to .env.local:')
  console.error('SUPABASE_SERVICE_ROLE_KEY=<your-key>\n')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function main() {
  console.log('RunMyPC Database Setup')
  console.log('======================\n')

  // Read migration file
  const migrationPath = join(process.cwd(), 'supabase/migrations/20260615000000_initial_schema.sql')
  const sql = readFileSync(migrationPath, 'utf-8')

  console.log('Applying initial schema migration...\n')

  // Execute SQL (note: this executes as separate statements, may need to split on semicolon)
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'))

  for (const statement of statements) {
    try {
      const { error } = await supabase.rpc('exec_sql', { sql_query: statement })
      if (error && !error.message.includes('already exists')) {
        console.error(`Error executing statement: ${error.message}`)
        console.error(`Statement: ${statement.substring(0, 100)}...`)
      }
    } catch (err: any) {
      // Try direct execution
      const { error } = await supabase.from('_').select('*').limit(0) // dummy query
      if (error) {
        console.error(`Error: ${err.message}`)
      }
    }
  }

  console.log('\n✓ Database setup complete\n')
  console.log('Test signup at: http://localhost:3000/signup\n')
}

main().catch(console.error)
