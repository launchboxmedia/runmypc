import Anthropic from '@anthropic-ai/sdk'
import { scrapeNicheAds } from '@/lib/apify'
import { createAdminClient } from '@/lib/supabase/admin'

const anthropic = new Anthropic()

const AD_ANGLES = ['pain_point', 'aspiration', 'social_proof', 'curiosity']

export async function runAdTestingLoop(jobId: string, parentJobId: string) {
  const supabase = createAdminClient()

  const { data: parentOutputs } = await supabase
    .from('job_outputs')
    .select('*')
    .eq('job_id', parentJobId)
    .eq('output_type', 'ad_copy')

  if (!parentOutputs?.length) return

  const adCopy = parentOutputs.filter(o => o.metadata?.type === 'ad_copy')
  if (!adCopy.length) return

  const { data: parentJob } = await supabase
    .from('jobs')
    .select('topic')
    .eq('id', parentJobId)
    .single()

  const topAds = await scrapeNicheAds(parentJob?.topic || '').catch(() => [])
  const adSummary = topAds.slice(0, 5).map((a: any) => JSON.stringify(a)).join('\n')

  const platforms = [...new Set(adCopy.map(a => a.platform))]

  for (const platform of platforms) {
    const platformAds = adCopy.filter(a => a.platform === platform)

    for (const ad of platformAds) {
      const originalAd = JSON.parse(ad.content)
      const variantAngle = AD_ANGLES[1]

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `You are an expert direct response copywriter for ${platform}.

Topic: ${parentJob?.topic}

Original ad (Variant A):
${JSON.stringify(originalAd)}

Top performing ads in this niche:
${adSummary}

Write Variant B using the ${variantAngle} angle. Predict which variant will perform better and why.

Respond ONLY with JSON:
{
  "variant_b": {
    "name": "Variant B — ${variantAngle}",
    "headline": "...",
    "body": "...",
    "cta": "...",
    "notes": "..."
  },
  "predicted_winner": "A or B",
  "prediction_reason": "..."
}`
        }]
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      const clean = text.replace(/```json|```/g, '').trim()
      const result = JSON.parse(clean)

      await supabase.from('job_outputs').insert({
        job_id: jobId,
        output_type: 'ad_copy',
        platform,
        label: `${platform} — Variant B (${variantAngle})`,
        content: JSON.stringify(result.variant_b),
        metadata: {
          type: 'ad_copy',
          loop: 'ad_testing',
          predicted_winner: result.predicted_winner,
          prediction_reason: result.prediction_reason,
          original_job_id: parentJobId
        }
      })

      await supabase.from('job_outputs').update({
        metadata: {
          ...ad.metadata,
          predicted_winner: result.predicted_winner,
          prediction_reason: result.prediction_reason
        }
      }).eq('id', ad.id)
    }
  }

  await supabase.from('jobs').update({
    status: 'completed',
    current_phase: null,
    current_step: null
  }).eq('id', jobId)
}
