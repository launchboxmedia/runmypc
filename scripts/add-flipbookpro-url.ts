import { createAdminClient } from '@/lib/supabase/admin'

async function main() {
  const supabase = createAdminClient()
  
  // Check if column exists
  const { data, error } = await supabase
    .from('jobs')
    .select('flipbookpro_url')
    .limit(1)
  
  if (error && error.message.includes('column')) {
    console.log('Column does not exist, needs manual migration')
    console.log('Run: ALTER TABLE jobs ADD COLUMN flipbookpro_url TEXT;')
    process.exit(1)
  }
  
  console.log('✓ Column exists')
}

main()
