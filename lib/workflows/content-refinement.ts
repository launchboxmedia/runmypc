import Anthropic from '@anthropic-ai/sdk'
import { scrapeNicheContent } from '@/lib/apify'
import { createAdminClient } from '@/lib/supabase/admin'

const anthropic = new Anthropic()

export async function runContentRefinementLoop(jobId: string, parentJobId: string) {
  const supabase = createAdminClient()

  const { data: parentOutputs } = await supabase
    .from('job_outputs')
    .select('*')
    .eq('job_id', parentJobId)
    .eq('output_type', 'ad_copy')

  if (!parentOutputs?.length) return

  const socialPosts = parentOutputs.filter(o => o.metadata?.type === 'social_post')
  if (!socialPosts.length) return

  const { data: parentJob } = await supabase
    .from('jobs')
    .select('topic')
    .eq('id', parentJobId)
    .single()

  const nicheContent = await scrapeNicheContent(parentJob?.topic || '').catch(() => [])
  const topContent = nicheContent.slice(0, 5).map((c: any) => JSON.stringify(c)).join('\n')

  const platforms = [...new Set(socialPosts.map(p => p.platform))]

  for (const platform of platforms) {
    const platformPosts = socialPosts.filter(p => p.platform === platform)

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `You are an expert ${platform} content strategist.

Topic: ${parentJob?.topic}

Currently generated ${platform} posts:
${platformPosts.map(p => p.content).join('\n\n')}

Top performing content in this niche:
${topContent}

Score each post 1-10 against top performing content patterns. Rewrite any post scoring below 7. Keep posts scoring 7+ as-is.

Respond ONLY with JSON:
{
  "refined_posts": [
    {
      "original_label": "...",
      "score": 8,
      "refined": true,
      "hook": "...",
      "body": "...",
      "cta": "...",
      "hashtags": ["..."],
      "improvement_note": "what was changed and why"
    }
  ]
}`
      }]
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const clean = text.replace(/```json|```/g, '').trim()
    const { refined_posts } = JSON.parse(clean)

    await supabase.from('job_outputs').insert(
      refined_posts.map((post: any) => ({
        job_id: jobId,
        output_type: 'ad_copy',
        platform,
        label: `${platform} — Refined Post`,
        content: JSON.stringify(post),
        metadata: {
          type: 'social_post',
          refined: true,
          score: post.score,
          improvement_note: post.improvement_note
        }
      }))
    )
  }

  await supabase.from('jobs').update({
    status: 'completed',
    current_phase: null,
    current_step: null
  }).eq('id', jobId)
}
