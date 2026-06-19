import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { executeContentGeneration } from '@/lib/workflows/content-generation'
import { executeBookGeneration } from '@/lib/workflows/book-generation'
import { executeAdGeneration } from '@/lib/workflows/ad-generation'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params
  const supabase = createAdminClient()

  try {
    // Get job details
    const { data: job, error: fetchError } = await supabase
      .from('jobs')
      .select('id, mode, status')
      .eq('id', jobId)
      .single()

    if (fetchError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    if (job.status !== 'running' && job.status !== 'queued') {
      return NextResponse.json(
        { error: `Job already ${job.status}` },
        { status: 400 }
      )
    }

    // Execute workflow based on mode
    const mode = job.mode

    // Run in background (don't await)
    ;(async () => {
      try {
        if (mode === 'full_run' || mode === 'ebook_only') {
          await executeBookGeneration(jobId)
        }
        if (mode === 'full_run' || mode === 'content_only') {
          await executeContentGeneration(jobId)
        }
        if (mode === 'full_run' || mode === 'ads_only') {
          await executeAdGeneration(jobId)
        }

        await supabase.from('jobs').update({ status: 'completed' }).eq('id', jobId)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        await supabase.from('jobs').update({
          status: 'failed',
          error: errorMessage
        }).eq('id', jobId)
      }
    })()

    return NextResponse.json({ success: true, jobId })
  } catch (error) {
    console.error('Execute error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to execute' },
      { status: 500 }
    )
  }
}
