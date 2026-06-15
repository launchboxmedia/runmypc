import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { scrapeNicheContent } from '@/lib/apify'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendMessage, buildStepUpdateMessage } from '@/lib/telegram'

let anthropic: Anthropic
let openai: OpenAI

function getClients() {
  if (!anthropic) anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return { anthropic, openai }
}

const PLATFORMS = ['instagram', 'tiktok', 'youtube', 'linkedin']

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

async function notifyStep(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  stepLabel: string,
  phase: string
) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('telegram_chat_id')
    .eq('id', userId)
    .single()

  if (profile?.telegram_chat_id) {
    await sendMessage(
      profile.telegram_chat_id,
      buildStepUpdateMessage(stepLabel, phase)
    ).catch(() => {})
  }
}

export async function executeContentGeneration(jobId: string) {
  const supabase = createAdminClient()

  try {
    // Step 1: Research niche content
    await updateStep(supabase, jobId, 'research-niche-content', 'running')

    const { data: job } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (!job) throw new Error('Job not found')

    await notifyStep(supabase, job.user_id, 'Researching top-performing content', 'content_generation')

    // Fetch user profile for brand context
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', job.user_id)
      .single()

    const brandContext = profile ? `
Brand context (apply to all content):
- Business: ${profile.business_name || 'not set'}
- Tone: ${profile.brand_tone || 'conversational'}
- Words to use: ${profile.words_to_use || 'none specified'}
- Words to avoid: ${profile.words_to_avoid || 'none specified'}
- Instagram: ${profile.instagram_handle || ''}
- TikTok: ${profile.tiktok_handle || ''}
- YouTube: ${profile.youtube_handle || ''}
- LinkedIn: ${profile.linkedin_url || ''}
${profile.brand_voice_examples ? `Voice examples:\n${profile.brand_voice_examples}` : ''}
` : ''

    const { anthropic } = getClients()

    // Extract precise search terms
    const extractionResponse = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Extract 3-5 precise search terms for finding top performing social media content in this niche.

Topic: ${job.topic}
Target audience: ${job.target_audience || ''}
What they learn: ${job.outcome || ''}

Return ONLY a JSON array of search terms, no explanation:
["term1", "term2", "term3"]

Terms should be specific keywords that would find relevant content on Instagram, TikTok, YouTube and LinkedIn. Not broad categories.`
      }]
    })

    const termsText = extractionResponse.content[0].type === 'text' ? extractionResponse.content[0].text : '[]'
    const terms = JSON.parse(termsText.replace(/```json|```/g, '').trim())
    const primarySearchTerm = terms[0] || job.topic
    const allTerms = terms.join(', ')
    const niche = primarySearchTerm // Use as niche for prompts

    const nicheContent = await scrapeNicheContent(primarySearchTerm).catch(() => [])

    // Parse and analyze research data
    const instagramPosts = nicheContent.filter((item: any) => item.caption || item.likesCount !== undefined)
    const tiktokVideos = nicheContent.filter((item: any) => item.text || item.playCount !== undefined)
    const youtubeVideos = nicheContent.filter((item: any) => item.title && item.viewCount !== undefined)
    const linkedinPosts = nicheContent.filter((item: any) => item.text && (item.likesCount !== undefined || item.commentsCount !== undefined))

    const topInstagram = instagramPosts.sort((a: any, b: any) =>
      ((b.likesCount || 0) + (b.commentsCount || 0)) - ((a.likesCount || 0) + (a.commentsCount || 0))
    )[0]

    const topTiktok = tiktokVideos.sort((a: any, b: any) =>
      ((b.playCount || 0) + (b.diggCount || 0)) - ((a.playCount || 0) + (a.diggCount || 0))
    )[0]

    const topYoutube = youtubeVideos.sort((a: any, b: any) =>
      ((b.viewCount || 0) + (b.likeCount || 0)) - ((a.viewCount || 0) + (a.likeCount || 0))
    )[0]

    const topLinkedin = linkedinPosts.sort((a: any, b: any) =>
      ((b.likesCount || 0) + (b.commentsCount || 0) + (b.repostsCount || 0)) -
      ((a.likesCount || 0) + (a.commentsCount || 0) + (a.repostsCount || 0))
    )[0]

    const topPerformers = {
      instagram: topInstagram ? {
        caption: (topInstagram.caption || '').substring(0, 100),
        likes: topInstagram.likesCount || 0,
        comments: topInstagram.commentsCount || 0
      } : null,
      tiktok: topTiktok ? {
        text: (topTiktok.text || '').substring(0, 100),
        views: topTiktok.playCount || 0,
        likes: topTiktok.diggCount || 0,
        shares: topTiktok.shareCount || 0
      } : null,
      youtube: topYoutube ? {
        title: topYoutube.title || '',
        views: topYoutube.viewCount || 0,
        likes: topYoutube.likeCount || 0
      } : null,
      linkedin: topLinkedin ? {
        text: (topLinkedin.text || '').substring(0, 100),
        likes: topLinkedin.likesCount || 0,
        comments: topLinkedin.commentsCount || 0,
        reposts: topLinkedin.repostsCount || 0
      } : null
    }

    let synthesis = 'No niche research data available.'
    if (topInstagram || topTiktok || topYoutube || topLinkedin) {
      const synthResponse = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `Based on this niche research data, identify in 3 bullet points what content angles and hook styles are performing best. Be specific and actionable. Data: ${JSON.stringify(topPerformers)}`
        }]
      })
      synthesis = synthResponse.content[0].type === 'text' ? synthResponse.content[0].text.trim() : synthesis
    }

    await supabase.from('job_outputs').insert({
      job_id: jobId,
      output_type: 'niche_research',
      platform: null,
      label: 'Niche Research',
      content: JSON.stringify({
        instagram: { count: instagramPosts.length, top_performer: topPerformers.instagram },
        tiktok: { count: tiktokVideos.length, top_performer: topPerformers.tiktok },
        youtube: { count: youtubeVideos.length, top_performer: topPerformers.youtube },
        linkedin: { count: linkedinPosts.length, top_performer: topPerformers.linkedin },
        synthesis
      }),
      metadata: { search_terms: allTerms, primary_term: primarySearchTerm }
    })

    await updateStep(supabase, jobId, 'research-niche-content', 'completed')

    // Step 2: Generate social copy
    await updateStep(supabase, jobId, 'generate-social-copy', 'running')
    await notifyStep(supabase, job.user_id, 'Writing social media posts', 'content_generation')

    const contentSummary = nicheContent.slice(0, 5)
      .map((item: Record<string, unknown>) => JSON.stringify(item))
      .join('\n')

    for (const platform of PLATFORMS) {
      const { anthropic } = getClients()

      let platformInstructions = ''
      let ctaSuffix = ''

      if (platform === 'youtube') {
        platformInstructions = 'YouTube community post or video description style. Keyword rich, search optimized, value-first, CTA at end.'
        if (profile?.youtube_handle) ctaSuffix = ` Mention ${profile.youtube_handle} in CTA.`
      } else if (platform === 'linkedin') {
        platformInstructions = 'Professional thought leadership tone. Insight-led, story or data hook, no hashtag spam. 3-5 short paragraphs, end with question to drive comments.'
        if (profile?.linkedin_url) ctaSuffix = ` Link to ${profile.linkedin_url} in CTA.`
      } else if (platform === 'instagram') {
        platformInstructions = `Match ${platform} native style, scroll-stopping hook, feel authentic.`
        if (profile?.instagram_handle) ctaSuffix = ` Include "Follow ${profile.instagram_handle}" in CTA.`
      } else if (platform === 'tiktok') {
        platformInstructions = `Match ${platform} native style, scroll-stopping hook, feel authentic.`
        if (profile?.tiktok_handle) ctaSuffix = ` Include "Follow ${profile.tiktok_handle}" in CTA.`
      } else {
        platformInstructions = `Match ${platform} native style, scroll-stopping hook, feel authentic.`
      }

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: `You are an expert ${platform} content creator in the ${niche} space.

Book topic: ${job.topic}

${brandContext}

Top performing content in this niche:
${contentSummary}

Create 3 high-performing ${platform} posts to promote this ebook. ${platformInstructions}${ctaSuffix}

Respond ONLY with JSON:
{
  "posts": [
    { "hook": "...", "body": "...", "cta": "...", "hashtags": ["..."] }
  ]
}`
        }]
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      const clean = text.replace(/```json|```/g, '').trim()

      let posts: any[]
      try {
        const parsed = JSON.parse(clean)
        posts = parsed.posts
      } catch (parseError) {
        console.error(`JSON parse error for ${platform} social copy:`, parseError)
        console.error(`Raw response text (first 500 chars):`, text.substring(0, 500))
        console.error(`Cleaned text (first 500 chars):`, clean.substring(0, 500))
        throw new Error(`Failed to parse ${platform} social copy JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`)
      }

      await supabase.from('job_outputs').insert(
        posts.map((post: Record<string, unknown>, i: number) => ({
          job_id: jobId,
          output_type: 'ad_copy',
          platform,
          label: `${platform} Post ${i + 1}`,
          content: JSON.stringify(post),
          metadata: { type: 'social_post' }
        }))
      )
    }

    await updateStep(supabase, jobId, 'generate-social-copy', 'completed')

    // Step 3: Generate static creatives
    await updateStep(supabase, jobId, 'generate-static-creatives', 'running')
    await notifyStep(supabase, job.user_id, 'Creating static visuals', 'content_generation')

    const creativePrompts = [
      {
        platform: 'instagram',
        label: 'Instagram Square Post',
        prompt: `Clean minimal promotional graphic for an ebook about ${job.topic}. Bold typography, ${niche} niche aesthetic, square format, high contrast, professional.`,
        size: '1024x1024' as const
      },
      {
        platform: 'facebook',
        label: 'Facebook Ad Creative',
        prompt: `Professional ebook advertisement for ${job.topic}. Clean layout, compelling headline space, ${niche} audience, rectangular format.`,
        size: '1536x1024' as const
      },
      {
        platform: 'instagram',
        label: 'Instagram Story',
        prompt: `Vertical story graphic promoting an ebook about ${job.topic}. Vibrant, bold, ${niche} niche, mobile-first design.`,
        size: '1024x1536' as const
      }
    ]

    for (const creative of creativePrompts) {
      try {
        const { generateImage } = await import('@/lib/atlascloud')
        const result = await generateImage({
          prompt: creative.prompt,
          model: 'gpt-image-2',
          size: creative.size
        })

        // Fetch image from URL
        const imageRes = await fetch(result.url)
        const buffer = Buffer.from(await imageRes.arrayBuffer())

        const filename = `${job.user_id}/${jobId}/creatives/${creative.platform}-${Date.now()}.jpg`

        const { error: uploadError } = await supabase.storage
          .from('job-assets')
          .upload(filename, buffer, { contentType: 'image/jpeg' })

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from('job-assets')
            .getPublicUrl(filename)

          await supabase.from('job_outputs').insert({
            job_id: jobId,
            output_type: 'static_creative',
            platform: creative.platform,
            label: creative.label,
            url: urlData.publicUrl,
            metadata: { size: creative.size }
          })
        }
      } catch (err) {
        console.error(`Failed to generate creative for ${creative.platform}:`, err)
      }
    }

    await updateStep(supabase, jobId, 'generate-static-creatives', 'completed')

    // Step 4: Generate Remotion videos
    await updateStep(supabase, jobId, 'generate-remotion-videos', 'running')
    await notifyStep(supabase, job.user_id, 'Rendering social videos', 'content_generation')

    try {
      // Get generated social posts
      const { data: socialOutputs } = await supabase
        .from('job_outputs')
        .select('*')
        .eq('job_id', jobId)
        .eq('output_type', 'ad_copy')

      if (!socialOutputs?.length) {
        await updateStep(supabase, jobId, 'generate-remotion-videos', 'completed')
      } else {
        // Get user profile for brand data
        const { data: profile } = await supabase
          .from('profiles')
          .select('brand_colors, business_name, instagram_handle, tiktok_handle, youtube_handle, linkedin_url')
          .eq('id', job.user_id)
          .single()

        // Parse first color from brand_colors
        const brandColor = profile?.brand_colors?.split(',')[0]?.trim() || '#E8622A'
        const businessName = profile?.business_name || 'RunMyPC'

        const handles: Record<string, string> = {
          instagram: profile?.instagram_handle || '',
          tiktok: profile?.tiktok_handle || '',
          youtube: profile?.youtube_handle || '',
          linkedin: profile?.linkedin_url || ''
        }

        // Parse posts
        const posts = socialOutputs
          .filter(o => o.metadata?.type === 'social_post')
          .map(o => {
            try {
              const parsed = JSON.parse(o.content || '{}')
              return {
                platform: o.platform || 'instagram',
                hook: parsed.hook || '',
                body: parsed.body || '',
                cta: parsed.cta || ''
              }
            } catch {
              return null
            }
          })
          .filter(Boolean) as Array<{ platform: string; hook: string; body: string; cta: string }>

        if (posts.length > 0) {
          // Render videos
          const { renderAllPlatformVideos } = await import('@/lib/remotionRender')
          const renderedVideos = await renderAllPlatformVideos({
            posts,
            brandColor,
            businessName,
            handles,
            jobId,
            userId: job.user_id
          })

          // Upload to Supabase Storage
          const { readFileSync, unlinkSync } = await import('fs')

          for (const video of renderedVideos) {
            try {
              const fileBuffer = readFileSync(video.filePath)
              const filename = `${job.user_id}/${jobId}/videos/${video.platform}-${Date.now()}.mp4`

              const { error: uploadError } = await supabase.storage
                .from('job-assets')
                .upload(filename, fileBuffer, { contentType: 'video/mp4' })

              if (!uploadError) {
                const { data: urlData } = supabase.storage
                  .from('job-assets')
                  .getPublicUrl(filename)

                await supabase.from('job_outputs').insert({
                  job_id: jobId,
                  output_type: 'social_video',
                  platform: video.platform,
                  label: `${video.platform} Video`,
                  url: urlData.publicUrl,
                  metadata: { type: 'remotion_video', platform: video.platform }
                })
              }

              // Cleanup temp file
              unlinkSync(video.filePath)
            } catch (err) {
              console.error(`Failed to upload video for ${video.platform}:`, err)
            }
          }
        }

        await updateStep(supabase, jobId, 'generate-remotion-videos', 'completed')
      }
    } catch (err) {
      console.error('Remotion video generation failed:', err)
      await updateStep(supabase, jobId, 'generate-remotion-videos', 'failed')
      // Don't throw — video failure shouldn't kill the whole job
    }

    // Step 5: Generate cinematic video
    await updateStep(supabase, jobId, 'generate-cinematic-video', 'running')
    await notifyStep(supabase, job.user_id, 'Generating cinematic video', 'content_generation')

    try {
      const { generateVideo } = await import('@/lib/atlascloud')
      const { BRAND_ASSETS } = await import('@/lib/brandAssets')

      // Get user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('business_name, brand_tone')
        .eq('id', job.user_id)
        .single()

      const businessName = profile?.business_name || 'RunMyPC'
      const tone = profile?.brand_tone || 'bold'

      // Build cinematic prompt
      const prompt = `A ${tone} cinematic vertical video for ${businessName}.
Topic: ${job.topic}
Style: Hip hop culture aesthetic, orange outline character on black background,
dynamic movement, professional and bold.
The RunMyPC brand character moves fluidly.
Orange accent color #E8622A throughout.
9:16 vertical format for social media.
No text overlay. Pure visual storytelling.`

      // Use b-boy character as reference if available
      const referenceImages = [
        BRAND_ASSETS.bboy,
        BRAND_ASSETS.graffitiWall
      ].filter(Boolean)

      const result = await generateVideo({
        prompt,
        referenceImageUrls: referenceImages,
        duration: 5,
        aspectRatio: '9:16',
        model: 'seedance-2.0-reference-to-video-fast'
      })

      if (result.status === 'completed' && result.output_url) {
        // Download and re-upload to Supabase Storage
        const videoRes = await fetch(result.output_url)
        const videoBuffer = Buffer.from(await videoRes.arrayBuffer())

        const filename = `${job.user_id}/${jobId}/videos/cinematic-${Date.now()}.mp4`

        const { error: uploadError } = await supabase.storage
          .from('job-assets')
          .upload(filename, videoBuffer, { contentType: 'video/mp4' })

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from('job-assets')
            .getPublicUrl(filename)

          await supabase.from('job_outputs').insert({
            job_id: jobId,
            output_type: 'cinematic_video',
            platform: null,
            label: 'Hero Cinematic Video',
            url: urlData.publicUrl,
            metadata: {
              type: 'atlas_cloud_video',
              model: 'seedance-2.0',
              duration: 5,
              atlas_id: result.id
            }
          })
        }
      }

      await updateStep(supabase, jobId, 'generate-cinematic-video', 'completed')
    } catch (err) {
      console.error('Atlas Cloud cinematic video failed:', err)
      await updateStep(supabase, jobId, 'generate-cinematic-video', 'failed')
      // Don't throw — video failure shouldn't kill the job
    }

    // Update job to next phase
    await supabase.from('jobs').update({
      current_phase: 'ad_generation'
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
