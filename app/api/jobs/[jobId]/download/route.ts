import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAssetsZip } from '@/lib/zip'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { jobId } = await params

  const { data: job } = await supabase
    .from('jobs')
    .select('id, topic, job_outputs(*)')
    .eq('id', jobId)
    .eq('user_id', user.id)
    .single()

  if (!job) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const zipBuffer = await createAssetsZip(job.job_outputs)
  const filename = `runmypc-${job.topic.slice(0, 30).replace(/\s+/g, '-')}.zip`

  return new Response(new Uint8Array(zipBuffer), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  })
}
