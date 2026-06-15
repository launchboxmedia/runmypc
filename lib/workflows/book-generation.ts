import { FlipBookProClient } from '@/lib/flipbookpro'
import { resolveBookSetup } from '@/lib/bookSetup'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@supabase/supabase-js'

async function updateStep(
  supabase: ReturnType<typeof createAdminClient>,
  jobId: string,
  stepKey: string,
  status: 'running' | 'completed' | 'failed',
  error?: string
) {
  await supabase.from('job_steps')
    .update({
      status,
      started_at: status === 'running' ? new Date().toISOString() : undefined,
      completed_at: status === 'completed' ? new Date().toISOString() : undefined,
      error
    })
    .eq('job_id', jobId)
    .eq('step_key', stepKey)
}

export async function executeBookGeneration(jobId: string) {
  const supabase = createAdminClient()

  try {
    // Step 1: Resolve book setup
    await updateStep(supabase, jobId, 'resolve-book-setup', 'running')

    const { data: jobs, error: jobError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)

    if (jobError || !jobs || jobs.length === 0) {
      throw new Error(jobError?.message || 'Job not found')
    }

    const job = jobs[0]

    const { data: profile } = await supabase
      .from('profiles')
      .select('flipbookpro_api_key, preferred_persona, preferred_palette, preferred_tone, preferred_reader_level')
      .eq('id', job.user_id)
      .single()

    if (!profile?.flipbookpro_api_key) throw new Error('No FlipBookPro API key set')

    const setup = await resolveBookSetup({
      topic: job.topic,
      userPreferences: {
        persona: profile.preferred_persona,
        palette: profile.preferred_palette,
        tone: profile.preferred_tone,
        reader_level: profile.preferred_reader_level
      }
    })

    await updateStep(supabase, jobId, 'resolve-book-setup', 'completed')

    // Step 2: Create book
    await updateStep(supabase, jobId, 'create-book', 'running')

    const client = new FlipBookProClient(profile.flipbookpro_api_key)
    const { book } = await client.createBook({ title: setup.title, persona: setup.persona })

    await supabase.from('jobs').update({
      flipbookpro_book_id: book.id,
      current_step: 'create-book'
    }).eq('id', jobId)

    await updateStep(supabase, jobId, 'create-book', 'completed')

    // Step 3: Detect chapters
    await updateStep(supabase, jobId, 'detect-chapters', 'running')
    const { chapters } = await client.detectChapters(setup.outline)
    await updateStep(supabase, jobId, 'detect-chapters', 'completed')

    // Step 4: Setup book with chapters
    await updateStep(supabase, jobId, 'setup-book', 'running')
    await client.setupBook(book.id, { ...setup, chapters })
    await updateStep(supabase, jobId, 'setup-book', 'completed')

    // Step 5: Fetch page IDs
    await updateStep(supabase, jobId, 'fetch-page-ids', 'running')
    const fbpSupabase = createClient(
      process.env.FLIPBOOKPRO_SUPABASE_URL!,
      process.env.FLIPBOOKPRO_SUPABASE_SERVICE_KEY!
    )
    const { data: pages } = await fbpSupabase
      .from('book_pages')
      .select('id, chapter_index')
      .eq('book_id', book.id)
      .order('chapter_index', { ascending: true })

    if (!pages || pages.length === 0) {
      throw new Error('No pages found after setup')
    }

    const pageIds = pages.map(p => p.id)
    await updateStep(supabase, jobId, 'fetch-page-ids', 'completed')

    // Step 6: Critique outline
    await updateStep(supabase, jobId, 'critique-outline', 'running')
    await client.critiqueOutline(book.id)
    await updateStep(supabase, jobId, 'critique-outline', 'completed')

    // Step 7: Generate chapters
    await updateStep(supabase, jobId, 'generate-chapters', 'running')
    for (let i = 0; i < chapters.length && i < pageIds.length; i++) {
      await client.generateDraft(book.id, i)
      await client.critiqueChapter(book.id, pageIds[i])
      await client.generateChapterImage(book.id, pageIds[i])
    }
    await updateStep(supabase, jobId, 'generate-chapters', 'completed')

    // Step 8: Generate cover
    await updateStep(supabase, jobId, 'generate-cover', 'running')
    await client.generateCoverImage(book.id)
    await updateStep(supabase, jobId, 'generate-cover', 'completed')

    // Step 9: Generate back matter
    await updateStep(supabase, jobId, 'generate-back-matter', 'running')
    await client.generateBackMatter(book.id)
    await client.generateBackCover(book.id)
    await updateStep(supabase, jobId, 'generate-back-matter', 'completed')

    // Step 10: Pre-publish check
    await updateStep(supabase, jobId, 'pre-publish-check', 'running')
    const { blockers } = await client.prePublishCheck(book.id)

    if (blockers.length > 0) {
      throw new Error(`Pre-publish blockers: ${blockers.join(', ')}`)
    }

    await updateStep(supabase, jobId, 'pre-publish-check', 'completed')

    // Step 11: Publish
    await updateStep(supabase, jobId, 'publish', 'running')
    const { slug } = await client.publishBook(book.id)

    const baseUrl = process.env.FLIPBOOKPRO_BASE_URL || 'https://bookbuilderpro.app'
    await supabase.from('job_outputs').insert([
      { job_id: jobId, output_type: 'flipbook_url', label: 'View Flipbook', url: `${baseUrl}/read/${slug}` },
      { job_id: jobId, output_type: 'sales_page_url', label: 'Sales Page', url: `${baseUrl}/read/${slug}` },
      { job_id: jobId, output_type: 'pdf_url', label: 'Download PDF', url: `${baseUrl}/api/books/${book.id}/export-pdf` }
    ])

    await supabase.from('jobs').update({
      flipbookpro_slug: slug,
      current_phase: 'content_generation',
      status: 'running'
    }).eq('id', jobId)

    await updateStep(supabase, jobId, 'publish', 'completed')

    return { bookId: book.id, slug }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    await supabase.from('jobs').update({
      status: 'failed',
      error: errorMessage
    }).eq('id', jobId)

    throw error
  }
}
