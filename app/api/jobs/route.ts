import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { executeBookGeneration } from '@/lib/workflows/book-generation'
import { executeContentGeneration } from '@/lib/workflows/content-generation'
import { executeAdGeneration } from '@/lib/workflows/ad-generation'
import { sendMessage, buildJobCompleteMessage, buildJobFailedMessage } from '@/lib/telegram'
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
  { step_key: 'generate-instagram-carousel', step_label: 'Creating Instagram carousel', phase: 'content_generation' },
  { step_key: 'generate-platform-videos', step_label: 'Producing platform videos', phase: 'content_generation' },
  { step_key: 'generate-remotion-videos', step_label: 'Producing social videos', phase: 'content_generation' },
  { step_key: 'generate-cinematic-video', step_label: 'Generating cinematic hero video', phase: 'content_generation' },
  { step_key: 'research-ads', step_label: 'Researching top ads in your niche', phase: 'ad_generation' },
  { step_key: 'generate-ad-copy', step_label: 'Writing ad copy for all platforms', phase: 'ad_generation' }
]

async function runWorkflowsSequentially(jobId: string) {
  const supabase = createAdminClient()

  try {
    const { data: job } = await supabase.from('jobs').select('mode, user_id, topic').eq('id', jobId).single()
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

    // Mark job as completed
    await supabase.from('jobs').update({ status: 'completed' }).eq('id', jobId)

    // Send Telegram completion notification
    const { data: profile } = await supabase
      .from('profiles')
      .select('telegram_chat_id')
      .eq('id', job.user_id)
      .single()

    if (profile?.telegram_chat_id) {
      const { data: completedJob } = await supabase
        .from('jobs')
        .select('*, job_outputs(*)')
        .eq('id', jobId)
        .single()

      if (completedJob) {
        await sendMessage(
          profile.telegram_chat_id,
          buildJobCompleteMessage(completedJob)
        ).catch(() => {})
      }
    }

  } catch (error) {
    console.error('Workflow execution failed:', error)

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    await supabase.from('jobs').update({
      status: 'failed',
      error: errorMessage
    }).eq('id', jobId)

    // Send Telegram failure notification
    const { data: job } = await supabase
      .from('jobs')
      .select('user_id, topic, error')
      .eq('id', jobId)
      .single()

    if (job) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('telegram_chat_id')
        .eq('id', job.user_id)
        .single()

      if (profile?.telegram_chat_id) {
        await sendMessage(
          profile.telegram_chat_id,
          buildJobFailedMessage({ topic: job.topic, error: job.error })
        ).catch(() => {})
      }
    }
  }
}

export async function POST(req: Request) {
  const supabase = await createClient()
  let userId: string

  // Check session auth first
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    userId = user.id
  } else {
    // Fall back to Telegram user ID header
    const telegramUserId = req.headers.get('x-telegram-user-id')
    if (telegramUserId) {
      userId = telegramUserId
    } else {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // Rate limit check
  const rateLimitResult = await checkRateLimit(userId)
  if (!rateLimitResult.allowed) {
    return NextResponse.json({ error: rateLimitResult.reason }, { status: 429 })
  }

  const adminSupabase = createAdminClient()

  const { topic, target_audience, outcome, mode, flipbookpro_url, selected_asset_ids, style_id, primary_color, split_image_cover } = await req.json().catch(() => ({}))
  if (!topic?.trim()) return NextResponse.json({ error: 'Topic is required.' }, { status: 400 })
  if (!target_audience?.trim()) return NextResponse.json({ error: 'Target audience is required.' }, { status: 400 })
  if (!outcome?.trim()) return NextResponse.json({ error: 'Outcome is required.' }, { status: 400 })
  if (!['full_run', 'ebook_only', 'content_only', 'ads_only'].includes(mode)) return NextResponse.json({ error: 'Invalid mode.' }, { status: 400 })

  const VALID_STYLE_IDS = ['bold_personal', 'clean_direct', 'warm_handmade', 'sharp_professional', 'premium_editorial']
  if (style_id != null && !VALID_STYLE_IDS.includes(style_id)) {
    return NextResponse.json({ error: 'Invalid style_id.' }, { status: 400 })
  }

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
      style_id: style_id ?? null,
      primary_color: primary_color ?? null,
      split_image_cover: split_image_cover === true,
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

  // Store selected assets if provided
  if (selected_asset_ids && Array.isArray(selected_asset_ids) && selected_asset_ids.length > 0) {
    await adminSupabase.from('job_selected_assets').insert(
      selected_asset_ids.map((assetId: string) => ({
        job_id: job.id,
        asset_id: assetId
      }))
    )
  }

  // Send Telegram start notification
  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('telegram_chat_id')
    .eq('id', userId)
    .single()

  if (profile?.telegram_chat_id) {
    await sendMessage(
      profile.telegram_chat_id,
      `🚀 <b>Campaign Started</b>

<b>Topic:</b> ${topic}
<b>Mode:</b> ${mode.replace(/_/g, ' ').toUpperCase()}

Agents are working... I'll update you at each step.

<a href="${process.env.NEXT_PUBLIC_APP_URL}/jobs/${job.id}">View Live Canvas →</a>`
    ).catch(() => {})
  }

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
