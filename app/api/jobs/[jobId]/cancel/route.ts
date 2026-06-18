import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ jobId: string }> }
) {
  const params = await props.params
  const { jobId } = params

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify job ownership
  const { data: job } = await supabase
    .from('jobs')
    .select('user_id, status')
    .eq('id', jobId)
    .single()

  if (!job || job.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (job.status !== 'running' && job.status !== 'queued') {
    return NextResponse.json({ error: 'Job not running' }, { status: 400 })
  }

  // Update job status to cancelled
  const { error: updateError } = await supabase
    .from('jobs')
    .update({
      status: 'cancelled',
      error: 'Cancelled by user',
      updated_at: new Date().toISOString()
    })
    .eq('id', jobId)

  if (updateError) {
    console.error('Failed to cancel job:', updateError)
    return NextResponse.json({ error: 'Failed to cancel' }, { status: 500 })
  }

  // Cancel any child loop jobs
  await supabase
    .from('jobs')
    .update({
      status: 'cancelled',
      error: 'Parent job cancelled',
      updated_at: new Date().toISOString()
    })
    .eq('parent_job_id', jobId)
    .in('status', ['running', 'queued'])

  return NextResponse.json({ success: true })
}
