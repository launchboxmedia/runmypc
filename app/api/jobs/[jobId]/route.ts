import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { jobId } = await params
  const adminSupabase = createAdminClient()

  const { data: job } = await adminSupabase
    .from('jobs')
    .select(`
      *,
      job_steps(step_key, step_label, status, started_at, completed_at, error, phase),
      job_outputs(id, output_type, platform, label, url, content, metadata)
    `)
    .eq('id', jobId)
    .eq('user_id', user.id)
    .single()

  if (!job) return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
  return NextResponse.json({ job })
}
