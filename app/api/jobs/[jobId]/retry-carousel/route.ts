import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params
  const supabase = createAdminClient()

  const { data: job } = await supabase.from('jobs').select('*').eq('id', jobId).single()
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', job.user_id).single()

  const { resolveDesignSystem } = await import('@/lib/designSystem/resolveDesignSystem')
  const resolvedDesign = await resolveDesignSystem({
    job: {
      style_id: job.style_id, primary_color: job.primary_color,
      split_image_cover: job.split_image_cover, topic: job.topic,
      target_audience: job.target_audience, outcome: job.outcome,
    },
    profile: profile
      ? { style_id: profile.style_id, primary_color: profile.primary_color, split_image_cover: profile.split_image_cover }
      : null,
  })

  const { data: assetJoins } = await supabase
    .from('job_selected_assets')
    .select('asset_id, business_assets!inner(*)')
    .eq('job_id', jobId)

  const selectedAssets = (assetJoins ?? [])
    .map((j: any) => j.business_assets)
    .filter((a: any) => a && a.status === 'approved' && (a.usable_in === 'static' || a.usable_in === 'both'))

  const { data: researchOutput } = await supabase
    .from('job_outputs').select('content')
    .eq('job_id', jobId).eq('output_type', 'niche_research').single()

  let selectedTopics: Array<{ title?: string; body?: string }> = [{ title: job.topic }]
  if (researchOutput?.content) {
    try {
      const r = JSON.parse(researchOutput.content)
      if (r.selected_topics?.length) selectedTopics = r.selected_topics
    } catch {}
  }

  // Reset step, drop old output
  await Promise.all([
    supabase.from('job_steps')
      .update({ status: 'running', error: null, started_at: new Date().toISOString(), completed_at: null })
      .eq('job_id', jobId).eq('step_key', 'generate-instagram-carousel'),
    supabase.from('job_outputs')
      .delete()
      .eq('job_id', jobId).eq('output_type', 'static_creative').eq('platform', 'instagram_carousel'),
  ])

  // Run in background — same logic as executeContentGeneration Step 4
  ;(async () => {
    try {
      const toDataUri = async (filePath: string): Promise<string | null> => {
        const { data: signed, error: signError } = await supabase.storage
          .from('job-assets').createSignedUrl(filePath, 3600)
        const primaryUrl = signed?.signedUrl
        const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/job-assets/${filePath}`
        if (!primaryUrl) console.warn(`[retry-carousel] signed URL failed for ${filePath}: ${signError?.message}`)
        try {
          const res = await fetch(primaryUrl || publicUrl)
          if (!res.ok) return null
          const buf = Buffer.from(await res.arrayBuffer())
          return `data:${res.headers.get('content-type') || 'image/png'};base64,${buf.toString('base64')}`
        } catch { return null }
      }

      const logoAsset = selectedAssets.find((a: any) => a.asset_type === 'logo')
      const logoDataUri = logoAsset?.file_path ? await toDataUri(logoAsset.file_path) : null
      if (logoAsset?.file_path && !logoDataUri)
        console.warn(`[retry-carousel] logo data-URI null for job ${jobId}`)

      let selectedAssetUrl: string | null = null
      const coverAsset = selectedAssets.find((a: any) =>
        a.asset_type !== 'logo' && typeof a.file_type === 'string' && a.file_type.startsWith('image')
      )
      if (coverAsset?.file_path) {
        const { data: signed } = await supabase.storage.from('job-assets').createSignedUrl(coverAsset.file_path, 3600)
        selectedAssetUrl = signed?.signedUrl || null
      }

      const researchContext = selectedTopics
        .slice(0, 5).map(t => [t.title, (t as any).body].filter(Boolean).join(': ')).join('\n')

      const { generateCarouselBeats } = await import('@/lib/carousel/generateCarouselBeats')
      const beats = await generateCarouselBeats({
        topic: job.topic, audience: job.target_audience, outcome: job.outcome,
        researchContext, stance: job.stance ?? null,
        ctaObjective: job.cta_objective ?? null, automationKeyword: job.automation_keyword ?? null,
      })

      const { checkHookOverflow } = await import('@/lib/carousel/layoutGuards')
      for (const w of checkHookOverflow(beats))
        console.warn(`[retry-carousel] overflow slide ${w.index}: ${w.chars} chars — "${w.title.slice(0, 60)}"`)

      const { compileCarousel } = await import('@/lib/carousel/phaseOrchestrator')
      const { renderAnimatedSlide, renderStaticPng } = await import('@/lib/carousel/renderClient')
      const { injectStaticVisibility } = await import('@/lib/carousel/slideHtml')

      const { slideHtml, ctaMeta } = await compileCarousel({
        beats, resolved: resolvedDesign, topic: job.topic,
        audience: job.target_audience,
        handle: profile?.instagram_handle ?? null,
        selectedAssetUrl, logoDataUri, proofAssetUrl: job.proof_asset_url ?? null,
        onCoverVisualFailure: async (reason) => {
          console.warn(`[retry-carousel] cover visual failed: ${reason}`)
          await supabase.from('job_steps')
            .update({ error: `Cover image generation failed: ${reason}` })
            .eq('job_id', jobId).eq('step_key', 'generate-instagram-carousel')
        },
      })

      type SlideAsset = { buffer: Buffer; ext: 'mp4' | 'png'; mime: string }
      const slideAssets: SlideAsset[] = await Promise.all(
        slideHtml.map(async (html): Promise<SlideAsset> => {
          try {
            return { buffer: await renderAnimatedSlide(html), ext: 'mp4', mime: 'video/mp4' }
          } catch (e) {
            console.warn(`[retry-carousel] animated failed → PNG fallback:`, e instanceof Error ? e.message : e)
            return { buffer: await renderStaticPng(injectStaticVisibility(html)), ext: 'png', mime: 'image/png' }
          }
        })
      )

      const slideStoragePaths: string[] = []
      const uploadedUrls: string[] = []

      for (let i = 0; i < slideAssets.length; i++) {
        const { buffer, ext, mime } = slideAssets[i]
        const ctaSuffix = ctaMeta?.igIndex === i ? 'cta-ig' : ctaMeta?.ttIndex === i ? 'cta-tt' : null
        const filename = `${job.user_id}/${jobId}/carousel/${ctaSuffix ?? `slide-${i + 1}`}.${ext}`
        const { error } = await supabase.storage.from('job-assets')
          .upload(filename, buffer, { contentType: mime, upsert: true })
        if (!error) {
          slideStoragePaths.push(filename)
          const { data: urlData } = await supabase.storage.from('job-assets').createSignedUrl(filename, 3600)
          if (urlData?.signedUrl) uploadedUrls.push(urlData.signedUrl)
        }
      }

      // Vision QA (fail-open)
      let visionVerdict: { status: 'PASS' | 'FAIL'; reason: string } | null = null
      const qaHtml = slideHtml[ctaMeta?.igIndex ?? 0] ?? slideHtml[0]
      if (qaHtml) {
        try {
          const { runVisionQA } = await import('@/lib/carousel/visionQA')
          const { logRenderFrame } = await import('@/lib/carousel/debugLogger')
          const qaPng = await renderStaticPng(injectStaticVisibility(qaHtml))
          await logRenderFrame(qaPng)
          visionVerdict = await runVisionQA(qaPng)
          if (visionVerdict.status === 'FAIL')
            console.warn(`[retry-carousel] Vision QA FAIL: ${visionVerdict.reason}`)
        } catch (qaErr) {
          console.warn(`[retry-carousel] Vision QA skipped:`, qaErr instanceof Error ? qaErr.message : qaErr)
        }
      }

      if (slideStoragePaths.length > 0) {
        await supabase.from('job_outputs').insert({
          job_id: jobId,
          output_type: 'static_creative',
          platform: 'instagram_carousel',
          label: `Instagram Carousel (${slideStoragePaths.length} Slides)`,
          url: uploadedUrls[0] || '',
          metadata: {
            type: 'carousel',
            storage_path: slideStoragePaths[0],
            slide_paths: slideStoragePaths,
            slide_urls: uploadedUrls,
            slide_count: slideStoragePaths.length,
            design_source: resolvedDesign.source,
            style_id: resolvedDesign.style_id,
            cta_keyword: ctaMeta?.keyword,
            cta_ig_index: ctaMeta?.igIndex,
            cta_tt_index: ctaMeta?.ttIndex,
            vision_qa: visionVerdict,
            review_required: visionVerdict?.status === 'FAIL',
            review_reason: visionVerdict?.status === 'FAIL' ? visionVerdict.reason : null,
          },
        })
      }

      await supabase.from('job_steps')
        .update({
          status: slideStoragePaths.length > 0 ? 'completed' : 'failed',
          completed_at: new Date().toISOString(),
        })
        .eq('job_id', jobId).eq('step_key', 'generate-instagram-carousel')

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[retry-carousel] failed:', msg)
      await supabase.from('job_steps')
        .update({ status: 'failed', error: msg.slice(0, 1000), completed_at: new Date().toISOString() })
        .eq('job_id', jobId).eq('step_key', 'generate-instagram-carousel')
    }
  })()

  return NextResponse.json({ success: true, jobId })
}
