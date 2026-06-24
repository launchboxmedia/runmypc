import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Clears the vision-QA review flag on a single job output (the "Dismiss Warning"
// action). Leaves the asset and the original vision_qa verdict intact — only the
// review_required flag is lowered so the amber badge stops rendering.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data: output, error: fetchError } = await supabase
    .from('job_outputs')
    .select('id, metadata')
    .eq('id', id)
    .single()

  if (fetchError || !output) {
    return NextResponse.json({ error: 'Output not found' }, { status: 404 })
  }

  const metadata = { ...(output.metadata ?? {}), review_required: false, review_dismissed: true }

  const { error: updateError } = await supabase
    .from('job_outputs')
    .update({ metadata })
    .eq('id', id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
