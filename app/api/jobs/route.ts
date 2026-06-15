import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { executeBookGeneration } from '@/lib/workflows/book-generation'
import { executeContentGeneration } from '@/lib/workflows/content-generation'
import { executeAdGeneration } from '@/lib/workflows/ad-generation'
import { checkRateLimit } from '@/lib/rateLimit'

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
  { step_key: 'generate-remotion-videos', step_label: 'Producing social videos', phase: 'content_generation' },
  { step_key: 'generate-cinematic-video', step_label: 'Generating cinematic hero video', phase: 'content_generation' },
  { step_key: 'research-ads', step_label: 'Researching top ads in your niche', phase: 'ad_generation' },
  { step_key: 'generate-ad-copy', step_label: 'Writing ad copy for all platforms', phase: 'ad_generation' }
]

async function runWorkflowsSequentially(jobId: string) {
  try {
    const supabase = createAdminClient()
    const { data: job } = await supabase.from('jobs').select('mode').eq('id', jobId).single()
    if (!job) throw new Error('Job not found')

    const mode = job.mode

    // Execute workflows based on mode
    if (mode === 'full_run' || mode === 'ebook_only') {
      await executeBookGeneration(jobId)
    }
    if (mode === 'full_run' || mode === 'content_only') {
      await executeContentGeneration(jobId)
    }
    if (mode === 'full_run' || mode === 'ads_only') {
      await executeAdGeneration(jobId)
    }
  } catch (error) {
    console.error('Workflow execution failed:', error)
  }
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = user.id

  // Rate limit check
  const rateLimitResult = await checkRateLimit(userId)
  if (!rateLimitResult.allowed) {
    return NextResponse.json({ error: rateLimitResult.reason }, { status: 429 })
  }

  const adminSupabase = createAdminClient()

  const { topic, target_audience, outcome, mode, flipbookpro_url } = await req.json().catch(() => ({}))
  if (!topic?.trim()) return NextResponse.json({ error: 'Topic is required.' }, { status: 400 })
  if (!target_audience?.trim()) return NextResponse.json({ error: 'Target audience is required.' }, { status: 400 })
  if (!outcome?.trim()) return NextResponse.json({ error: 'Outcome is required.' }, { status: 400 })
  if (!['full_run', 'ebook_only', 'content_only', 'ads_only'].includes(mode)) return NextResponse.json({ error: 'Invalid mode.' }, { status: 400 })

  // Only check API key for modes that generate ebooks
  if (mode === 'full_run' || mode === 'ebook_only') {
    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('flipbookpro_api_key')
      .eq('id', userId)
      .single()

    if (!profile?.flipbookpro_api_key) {
      return NextResponse.json({
        error: 'No FlipBookPro API key set.'
      }, { status: 400 })
    }
  }

  // Determine starting phase based on mode
  const startingPhase = mode === 'content_only' ? 'content_generation'
    : mode === 'ads_only' ? 'ad_generation'
    : 'book_generation'

  const { data: job, error } = await adminSupabase
    .from('jobs')
    .insert({
      user_id: userId,
      topic: topic.trim(),
      target_audience: target_audience.trim(),
      outcome: outcome.trim(),
      mode,
      // flipbookpro_url: flipbookpro_url || null, // TODO: Add column migration
      status: 'queued',
      current_phase: startingPhase
    })
    .select('id')
    .single()

  if (error || !job) return NextResponse.json({ error: 'Failed to create job.' }, { status: 500 })

  // Filter steps based on mode
  const relevantSteps = BOOK_STEPS.filter(step => {
    if (mode === 'ebook_only') return step.phase === 'book_generation'
    if (mode === 'content_only') return step.phase === 'content_generation'
    if (mode === 'ads_only') return step.phase === 'ad_generation'
    return true // full_run includes all steps
  })

  await adminSupabase.from('job_steps').insert(
    relevantSteps.map(step => ({
      job_id: job.id,
      phase: step.phase,
      step_key: step.step_key,
      step_label: step.step_label,
      status: 'pending'
    }))
  )

  // Start workflow execution in background
  runWorkflowsSequentially(job.id)

  return NextResponse.json({ jobId: job.id }, { status: 201 })
}

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const parentJobId = searchParams.get('parent_job_id')
  const adminSupabase = createAdminClient()

  let query = adminSupabase
    .from('jobs')
    .select(`
      *,
      job_steps(step_key, step_label, status, started_at, completed_at, error, phase),
      job_outputs(id, output_type, platform, label, url, content, metadata)
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (parentJobId) {
    query = query.eq('parent_job_id', parentJobId)
  } else {
    query = query.is('parent_job_id', null)
  }

  const { data: jobs } = await query
  return NextResponse.json({ jobs: jobs || [] })
}
