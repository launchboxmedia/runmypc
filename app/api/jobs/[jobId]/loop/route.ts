import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runContentRefinementLoop } from '@/lib/workflows/content-refinement'
import { runAdTestingLoop } from '@/lib/workflows/ad-testing'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params
  const { loopType, parentJobId } = await req.json()
  const supabase = createAdminClient()

  await supabase.from('jobs').update({
    status: 'running',
    current_step: loopType
  }).eq('id', jobId)

  try {
    if (loopType === 'content_refinement') {
      await runContentRefinementLoop(jobId, parentJobId)
    } else if (loopType === 'ad_testing') {
      await runAdTestingLoop(jobId, parentJobId)
    }
  } catch (error) {
    await supabase.from('jobs').update({
      status: 'failed',
      error: error instanceof Error ? error.message : 'Loop failed'
    }).eq('id', jobId)
  }

  return NextResponse.json({ ok: true })
}
