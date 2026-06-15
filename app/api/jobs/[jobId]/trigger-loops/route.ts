import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { jobId } = await params
  const adminSupabase = createAdminClient()

  const { data: parentJob } = await adminSupabase
    .from('jobs')
    .select('topic')
    .eq('id', jobId)
    .eq('user_id', user.id)
    .single()

  if (!parentJob) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const loops = ['content_refinement', 'ad_testing'] as const

  for (const loopType of loops) {
    const { data: loopJob } = await adminSupabase
      .from('jobs')
      .insert({
        user_id: user.id,
        topic: parentJob.topic,
        mode: 'full_run',
        status: 'queued',
        parent_job_id: jobId,
        loop_type: loopType,
        loop_number: 1
      })
      .select('id')
      .single()

    if (loopJob) {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/jobs/${loopJob.id}/loop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loopType, parentJobId: jobId })
      })
    }
  }

  return NextResponse.json({ ok: true })
}
