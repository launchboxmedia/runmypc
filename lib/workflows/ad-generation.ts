import Anthropic from '@anthropic-ai/sdk'
import { scrapeNicheAds } from '@/lib/apify'
import { createAdminClient } from '@/lib/supabase/admin'

let anthropic: Anthropic

function getAnthropic() {
  if (!anthropic) anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return anthropic
}

const AD_PLATFORMS = [
  { key: 'facebook', label: 'Facebook/Instagram Ads', format: 'Feed ad with headline, body, CTA' },
  { key: 'tiktok', label: 'TikTok Ads', format: 'Short punchy script, 15-30 seconds' },
  { key: 'google', label: 'Google Ads', format: 'Responsive search ad: 3 headlines (30 chars max), 2 descriptions (90 chars max)' },
  { key: 'x', label: 'X (Twitter) Ads', format: 'Promoted tweet, max 280 chars, punchy' }
]

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

export async function executeAdGeneration(jobId: string) {
  const supabase = createAdminClient()

  try {
    // Step 1: Research ads
    await updateStep(supabase, jobId, 'research-ads', 'running')

    const { data: job } = await supabase
      .from('jobs')
      .select('topic')
      .eq('id', jobId)
      .single()

    if (!job) throw new Error('Job not found')

    const anthropic = getAnthropic()
    const nicheResponse = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: `Extract the core niche from: "${job.topic}". Respond with 2-3 words only.`
      }]
    })

    const niche = nicheResponse.content[0].type === 'text'
      ? nicheResponse.content[0].text.trim()
      : job.topic

    const topAds = await scrapeNicheAds(niche).catch(() => [])
    await updateStep(supabase, jobId, 'research-ads', 'completed')

    // Step 2: Generate ad copy
    await updateStep(supabase, jobId, 'generate-ad-copy', 'running')

    const adSummary = topAds.slice(0, 5)
      .map((ad: Record<string, unknown>) => JSON.stringify(ad))
      .join('\n')

    for (const platform of AD_PLATFORMS) {
      const anthropic = getAnthropic()
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: `You are an expert direct response copywriter specializing in ${platform.label}.

Product: Ebook about ${job.topic}
Niche: ${niche}
Format required: ${platform.format}

Top performing ads in this niche:
${adSummary}

Write 3 ad variants using proven direct response principles. Each should have a compelling hook, address a specific pain point, clear value proposition, strong CTA.

Respond ONLY with JSON:
{
  "variants": [
    {
      "name": "Variant A — Pain Point",
      "headline": "...",
      "body": "...",
      "cta": "...",
      "notes": "why this angle works"
    }
  ]
}`
        }]
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      const clean = text.replace(/```json|```/g, '').trim()

      let variants: any[]
      try {
        const parsed = JSON.parse(clean)
        variants = parsed.variants
      } catch (parseError) {
        console.error(`JSON parse error for ${platform.label} ad copy:`, parseError)
        console.error(`Raw response text (first 500 chars):`, text.substring(0, 500))
        console.error(`Cleaned text (first 500 chars):`, clean.substring(0, 500))
        throw new Error(`Failed to parse ${platform.label} ad copy JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`)
      }

      await supabase.from('job_outputs').insert(
        variants.map((variant: Record<string, unknown>, i: number) => ({
          job_id: jobId,
          output_type: 'ad_copy',
          platform: platform.key,
          label: `${platform.label} — Variant ${i + 1}`,
          content: JSON.stringify(variant),
          metadata: {
            type: 'ad_copy',
            format: platform.format,
            research_grounding: {
              topic_used: niche,
              source: 'ad_scraping',
              ads_analyzed: topAds.length
            }
          }
        }))
      )
    }

    await updateStep(supabase, jobId, 'generate-ad-copy', 'completed')

    // Mark job as completed
    await supabase.from('jobs').update({
      status: 'completed',
      current_phase: null,
      current_step: null
    }).eq('id', jobId)

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    await supabase.from('jobs').update({
      status: 'failed',
      error: errorMessage
    }).eq('id', jobId)

    throw error
  }
}
