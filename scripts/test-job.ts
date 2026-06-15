import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { executeBookGeneration } from '../lib/workflows/book-generation'
import { executeContentGeneration } from '../lib/workflows/content-generation'
import { executeAdGeneration } from '../lib/workflows/ad-generation'

config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TEST_FBP_API_KEY = process.env.TEST_FBP_API_KEY

async function main() {
  if (!TEST_FBP_API_KEY) {
    console.error('❌ TEST_FBP_API_KEY not set in .env.local')
    process.exit(1)
  }

  console.log('🔍 Finding first user in profiles table...')
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, email')
    .limit(1)

  if (profileError || !profiles || profiles.length === 0) {
    console.error('❌ No users found in profiles table')
    process.exit(1)
  }

  const user = profiles[0]
  console.log(`✓ Found user: ${user.email} (${user.id})`)

  console.log('🔑 Updating FlipBookPro API key...')
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ flipbookpro_api_key: TEST_FBP_API_KEY })
    .eq('id', user.id)

  if (updateError) {
    console.error('❌ Failed to update API key:', updateError)
    process.exit(1)
  }

  console.log('✓ API key updated')

  console.log('\n📤 Creating job...')
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .insert({
      user_id: user.id,
      topic: 'AI tools for content creators',
      mode: 'autopilot',
      status: 'queued',
      current_phase: 'book_generation'
    })
    .select('id')
    .single()

  if (jobError || !job) {
    console.error('❌ Failed to create job:', jobError)
    process.exit(1)
  }

  const jobId = job.id
  console.log(`✓ Job created: ${jobId}`)

  // Insert job steps
  const BOOK_STEPS = [
    { step_key: 'resolve-book-setup', step_label: 'Analyzing topic & deciding book style', phase: 'book_generation' },
    { step_key: 'create-book', step_label: 'Creating book in FlipBookPro', phase: 'book_generation' },
    { step_key: 'setup-book', step_label: 'Configuring book settings', phase: 'book_generation' },
    { step_key: 'detect-chapters', step_label: 'Detecting chapters from outline', phase: 'book_generation' },
    { step_key: 'critique-outline', step_label: 'Critiquing outline structure', phase: 'book_generation' },
    { step_key: 'generate-chapters', step_label: 'Writing & illustrating all chapters', phase: 'book_generation' },
    { step_key: 'generate-cover', step_label: 'Generating cover image', phase: 'book_generation' },
    { step_key: 'generate-back-matter', step_label: 'Generating back matter & back cover', phase: 'book_generation' },
    { step_key: 'pre-publish-check', step_label: 'Running pre-publish checks', phase: 'book_generation' },
    { step_key: 'publish', step_label: 'Publishing ebook', phase: 'book_generation' },
    { step_key: 'research-niche-content', step_label: 'Researching top content in your niche', phase: 'content_generation' },
    { step_key: 'generate-social-copy', step_label: 'Writing social media content', phase: 'content_generation' },
    { step_key: 'generate-static-creatives', step_label: 'Generating static ad creatives', phase: 'content_generation' },
    { step_key: 'research-ads', step_label: 'Researching top ads in your niche', phase: 'ad_generation' },
    { step_key: 'generate-ad-copy', step_label: 'Writing ad copy for all platforms', phase: 'ad_generation' }
  ]

  await supabase.from('job_steps').insert(
    BOOK_STEPS.map(step => ({
      job_id: jobId,
      phase: step.phase,
      step_key: step.step_key,
      step_label: step.step_label,
      status: 'pending'
    }))
  )

  console.log('✓ Job steps created')

  // Trigger workflow execution
  console.log('\n🚀 Starting workflow execution in background...')

  // Run workflows sequentially in background
  ;(async () => {
    try {
      await executeBookGeneration(jobId)
      await executeContentGeneration(jobId)
      await executeAdGeneration(jobId)
    } catch (err) {
      console.error('\n❌ Workflow error:', err)
    }
  })()

  console.log('\n📊 Polling job status...\n')

  let status = 'queued'
  while (status !== 'completed' && status !== 'failed') {
    await new Promise(resolve => setTimeout(resolve, 5000))

    const { data: job } = await supabase
      .from('jobs')
      .select('id, status, current_phase, current_step, error, job_outputs(*)')
      .eq('id', jobId)
      .single()

    if (!job) {
      console.error('❌ Job not found')
      process.exit(1)
    }

    status = job.status
    console.log(`[${new Date().toLocaleTimeString()}] Status: ${status} | Phase: ${job.current_phase || 'none'} | Step: ${job.current_step || 'none'}`)

    if (job.error) {
      console.error(`\n❌ Job error: ${job.error}`)
    }
  }

  console.log('\n✅ Job complete!')

  const { data: finalJob } = await supabase
    .from('jobs')
    .select('*, job_outputs(*)')
    .eq('id', jobId)
    .single()

  if (finalJob && finalJob.job_outputs) {
    console.log('\n📦 Outputs:')
    finalJob.job_outputs.forEach((output: any) => {
      console.log(`  - ${output.label} (${output.output_type})`)
      if (output.url) console.log(`    URL: ${output.url}`)
      if (output.content) console.log(`    Content: ${output.content.slice(0, 100)}...`)
    })
  }
}

main().catch(console.error)
