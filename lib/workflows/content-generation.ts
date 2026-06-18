import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import * as path from 'path'
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
  status: 'running' | 'completed' | 'failed' | 'skipped',
  error?: string
) {
  await supabase.from('job_steps')
    .update({
      status,
      started_at: status === 'running' ? new Date().toISOString() : undefined,
      completed_at: status === 'completed' || status === 'skipped' ? new Date().toISOString() : undefined,
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
    // Step 1: Research niche content — Three-layer intelligence
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

    // Step 0: Niche classification + term extraction
    const extractionResponse = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Extract 3-5 precise search terms and classify this niche.

Topic: ${job.topic}
Target audience: ${job.target_audience || ''}
What they learn: ${job.outcome || ''}

Respond ONLY with JSON:
{
  "terms": ["term1", "term2", "term3"],
  "is_b2b": boolean
}

is_b2b = true if niche targets businesses/professionals (consulting, B2B SaaS, corporate training, business funding, etc)
is_b2b = false if niche targets consumers (credit repair, fitness, personal finance, dating, etc)`
      }]
    })

    const extractionText = extractionResponse.content[0].type === 'text' ? extractionResponse.content[0].text : '{}'
    const jsonMatch = extractionText.match(/\{[\s\S]*\}/)
    const extraction = JSON.parse(jsonMatch ? jsonMatch[0] : '{}')
    const terms = extraction.terms || [job.topic]
    const isB2B = extraction.is_b2b || false
    const primaryTerm = terms[0] || job.topic

    // LAYER 1 — Search Intent via Autocomplete
    const { runApifyActor } = await import('@/lib/apify')
    const autocompleteResults = await runApifyActor('easyapi/keyword-suggestions-scraper', {
      keyword: job.topic,
      platforms: ['google', 'youtube', 'tiktok', 'instagram'],
      maxSuggestions: 20
    }).catch(() => [])

    // LAYER 2 — Social content scraping (parallel)
    // Instagram: try hashtag → usernames → reels, fallback to direct hashtag scraper
    const instagramHashtagResults = await runApifyActor('apify/instagram-hashtag-scraper', {
      hashtags: [primaryTerm.replace(/\s+/g, '')],
      resultsLimit: 30
    }).catch(() => [])

    const instagramUsernames = [
      ...new Set(
        instagramHashtagResults
          .slice(0, 10)
          .map((p: any) => p.ownerUsername || p.username)
          .filter(Boolean)
      )
    ].slice(0, 5)

    let instagramResults = instagramUsernames.length > 0
      ? await runApifyActor('apify/instagram-reel-scraper', {
          usernames: instagramUsernames,
          resultsLimit: 15
        }).catch(() => [])
      : []

    // Fallback: if no results from reel scraper, use hashtag results directly
    if (instagramResults.length === 0 && instagramHashtagResults.length > 0) {
      instagramResults = instagramHashtagResults.slice(0, 15)
    }

    const [tiktokResults, youtubeResults, linkedinResults, redditResults, newsResults] = await Promise.all([
      // TikTok
      runApifyActor('clockworks/tiktok-scraper', {
        hashtags: [primaryTerm.replace(/\s+/g, '')],
        resultsPerPage: 15
      }).catch(() => []),

      // YouTube
      runApifyActor('streamers/youtube-scraper', {
        searchQueries: [primaryTerm],
        maxResults: 15
      }).catch(() => []),

      // LinkedIn (only if B2B)
      isB2B
        ? runApifyActor('harvestapi/linkedin-post-search', {
            searchQueries: [primaryTerm],
            maxPosts: 15
          }).catch(() => [])
        : Promise.resolve([]),

      // Reddit via Firecrawl
      (async () => {
        try {
          const { scrapeUrl } = await import('@/lib/firecrawl')
          const redditUrl = `https://old.reddit.com/search?q=${encodeURIComponent(primaryTerm)}&sort=relevance&t=month`
          const scraped = await scrapeUrl(redditUrl)

          // Extract thread titles + selftext from markdown
          const threads = scraped.content
            .split('\n\n')
            .filter(block => block.includes('r/') || block.includes('comments'))
            .slice(0, 10)
            .map(block => ({
              title: block.split('\n')[0] || '',
              selftext: block.split('\n').slice(1).join(' ').slice(0, 500)
            }))

          return threads
        } catch {
          return []
        }
      })(),

      // News via web search + Firecrawl
      (async () => {
        try {
          const { openai } = getClients()
          // Use GPT-4 web search to find recent news URLs
          const searchResponse = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{
              role: 'user',
              content: `Find 3 recent, relevant news article URLs about: ${primaryTerm}. Return ONLY a JSON array of URLs: ["url1", "url2", "url3"]`
            }],
            max_tokens: 200
          })

          const searchText = searchResponse.choices[0]?.message?.content || '[]'
          const arrayMatch = searchText.match(/\[[\s\S]*\]/)
          const urls = JSON.parse(arrayMatch ? arrayMatch[0] : '[]')

          if (!Array.isArray(urls) || urls.length === 0) return []

          const { scrapeMultipleUrls } = await import('@/lib/firecrawl')
          const articles = await scrapeMultipleUrls(urls.slice(0, 3))

          return articles.map(a => ({
            title: a.title || '',
            content: a.content.slice(0, 2000),
            url: a.url
          }))
        } catch {
          return []
        }
      })()
    ])

    // LAYER 3 — Content filtering
    const {
      filterSocialContent,
      filterRedditContent,
      filterNewsContent
    } = await import('@/lib/contentFilters')

    const [
      filteredInstagram,
      filteredTikTok,
      filteredLinkedIn,
      filteredReddit,
      filteredNews
    ] = await Promise.all([
      filterSocialContent(instagramResults, 'instagram'),
      filterSocialContent(tiktokResults, 'tiktok'),
      isB2B && linkedinResults.length > 0
        ? filterSocialContent(linkedinResults, 'linkedin')
        : Promise.resolve([]),
      filterRedditContent(redditResults),
      Promise.resolve(filterNewsContent(newsResults))
    ])

    const approvedInstagram = filteredInstagram.filter(f => !f.excluded).map(f => f.content)
    const approvedTikTok = filteredTikTok.filter(f => !f.excluded).map(f => f.content)
    const approvedLinkedIn = filteredLinkedIn.filter(f => !f.excluded).map(f => f.content)
    const approvedReddit = filteredReddit.filter(f => !f.excluded).map(f => f.content)
    const approvedNews = filteredNews.filter(f => !f.excluded).map(f => f.content)

    // LAYER 4 — Topic selection (Reddit + News intersection)
    const topicResponse = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Identify the best content topic(s) from this research.

NICHE: ${job.topic}

REDDIT QUESTIONS (real confusion):
${approvedReddit.slice(0, 10).map((r: any) => `- ${r.title}`).join('\n')}

NEWS TOPICS (current relevance):
${approvedNews.slice(0, 5).map((n: any) => `- ${n.title}`).join('\n')}

Prioritize:
1. Intersections where Reddit question + news item overlap (strongest signal)
2. Fall back to top Reddit question or news item alone if no overlap

Respond ONLY with JSON:
{
  "topics": [
    { "title": "specific topic", "source": "reddit_news_overlap|reddit|news" }
  ]
}

Return 1-3 topics max.`
      }]
    })

    const topicText = topicResponse.content[0].type === 'text' ? topicResponse.content[0].text : '{}'
    const topicMatch = topicText.match(/\{[\s\S]*\}/)
    const topicData = JSON.parse(topicMatch ? topicMatch[0] : '{}')
    const selectedTopics = topicData.topics || [{ title: job.topic, source: 'fallback' }]

    // LAYER 5 — Format reference analysis (social accounts)
    const formatResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `Analyze these top-performing social accounts to extract format patterns.

INSTAGRAM:
${approvedInstagram.slice(0, 5).map((p: any) => {
  const likes = p.likesCount || p.likes || 0
  const caption = p.caption || p.text || ''
  return `- "${caption.slice(0, 150)}" — ${likes} likes`
}).join('\n')}

TIKTOK:
${approvedTikTok.slice(0, 5).map((p: any) => {
  const likes = p.diggCount || p.likes || 0
  const text = p.text || p.desc || ''
  return `- "${text.slice(0, 150)}" — ${likes} likes`
}).join('\n')}

${isB2B && approvedLinkedIn.length > 0 ? `LINKEDIN:
${approvedLinkedIn.slice(0, 5).map((p: any) => {
  const likes = p.likesCount || p.likes || 0
  const text = p.text || p.content || ''
  return `- "${text.slice(0, 150)}" — ${likes} likes`
}).join('\n')}` : ''}

Extract ONLY format patterns (hook style, structure, length, CTA convention).
Do NOT extract topic/subject matter — topics come from separate research.

Respond ONLY with JSON:
{
  "hook_patterns": ["pattern 1", "pattern 2", "pattern 3"],
  "structure_patterns": ["pattern 1", "pattern 2"],
  "cta_conventions": ["convention 1", "convention 2"]
}`
      }]
    })

    const formatText = formatResponse.content[0].type === 'text' ? formatResponse.content[0].text : '{}'
    const formatMatch = formatText.match(/\{[\s\S]*\}/)
    const formatData = JSON.parse(formatMatch ? formatMatch[0] : '{}')

    // Store full research intelligence
    await supabase.from('job_outputs').insert({
      job_id: jobId,
      output_type: 'niche_research',
      platform: null,
      label: 'Content Research Intelligence',
      content: JSON.stringify({
        niche_classification: { is_b2b: isB2B, terms },
        selected_topics: selectedTopics,
        format_reference: formatData,
        sources_analyzed: {
          instagram: approvedInstagram.length,
          tiktok: approvedTikTok.length,
          youtube: youtubeResults.length,
          linkedin: approvedLinkedIn.length,
          reddit: approvedReddit.length,
          news: approvedNews.length
        },
        autocomplete_suggestions: autocompleteResults.slice(0, 10)
      }),
      metadata: {
        primary_topic: selectedTopics[0]?.title || job.topic,
        is_b2b: isB2B
      }
    })

    await updateStep(supabase, jobId, 'research-niche-content', 'completed')

    // Step 2: Generate social copy
    await updateStep(supabase, jobId, 'generate-social-copy', 'running')
    await notifyStep(supabase, job.user_id, 'Writing social media posts', 'content_generation')

    const primaryTopic = selectedTopics[0]?.title || job.topic
    const hookPatterns = formatData.hook_patterns?.join('\n') || ''
    const structurePatterns = formatData.structure_patterns?.join('\n') || ''

    // Fetch business facts for safety checks
    const { getBusinessFacts } = await import('@/lib/businessFacts')
    const businessFacts = await getBusinessFacts(job.user_id, {
      serviceTag: job.service_tag // filter by service tag if job has one
    })

    // Build facts context for generation
    const factsContext = businessFacts.length > 0 ? `

VERIFIED BUSINESS FACTS (use ONLY these, never invent):
${businessFacts.map(f => `- [${f.type.toUpperCase()}] ${f.content}`).join('\n')}

CRITICAL: If you need a result/credential/location claim, use ONLY the facts above. If none exist, generate educational content instead. Never invent placeholder numbers or unverified claims.` : `

CRITICAL: No business facts have been provided. Do NOT generate any posts claiming specific results, credentials, locations, or client testimonials. Focus on educational/value content only.`

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

      // Check if we can generate results-style content
      const hasResultFacts = businessFacts.some(f => f.type === 'result')
      const contentTypeInstruction = hasResultFacts
        ? 'You may include educational content OR results/testimonial content (using verified facts only).'
        : 'Focus on educational/value content only. Do NOT generate results or testimonial posts.'

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: `You are an expert ${platform} content creator.

=== TOPIC (what to write about) ===
${primaryTopic}

Book context: ${job.topic}
Target audience: ${job.target_audience || 'general'}

=== FORMAT REFERENCE (how to structure it) ===
Hook patterns that work:
${hookPatterns}

Structure patterns:
${structurePatterns}

=== BRAND VOICE CONSTRAINTS ===
${brandContext}

${factsContext}

Content built on demonstrated expertise and service, not hacks.
No guaranteed-outcome claims.
No fabricated specifics about real people, cases, or numbers.
${contentTypeInstruction}

=== INSTRUCTIONS ===
Create 3 high-performing ${platform} posts about the TOPIC above.
Structure them using FORMAT REFERENCE patterns.
Keep all content compliant with BRAND VOICE CONSTRAINTS.

${platformInstructions}${ctaSuffix}

Respond ONLY with JSON:
{
  "posts": [
    { "hook": "...", "body": "...", "cta": "...", "hashtags": ["..."] }
  ]
}`
        }]
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : ''

      let posts: any[]
      try {
        // Extract first complete JSON object from response
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
          throw new Error('No JSON object found in response')
        }
        const parsed = JSON.parse(jsonMatch[0])
        posts = parsed.posts

        if (!Array.isArray(posts) || posts.length === 0) {
          throw new Error('No posts array in parsed JSON')
        }
      } catch (parseError) {
        console.error(`JSON parse error for ${platform} social copy:`, parseError)
        console.error(`Raw response text (first 500 chars):`, text.substring(0, 500))
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

    // Step 3: Generate static creatives (all platforms via Atlas Cloud)
    await updateStep(supabase, jobId, 'generate-static-creatives', 'running')
    await notifyStep(supabase, job.user_id, 'Creating static visuals', 'content_generation')

    const brandColor = profile?.brand_colors?.split(',')[0]?.trim() || '#E8622A'

    // Fetch approved business assets for result-based creatives
    const { getBusinessAssets } = await import('@/lib/businessFacts')
    const approvedAssets = await getBusinessAssets(job.user_id, { status: 'approved' })
    const resultFacts = businessFacts.filter(f => f.type === 'result')

    // Get assets linked to result facts
    const resultAssets = approvedAssets.filter(a =>
      a.business_fact_id && resultFacts.some(f => f.id === a.business_fact_id)
    )

    const CREATIVE_SPECS = [
      {
        platform: 'instagram',
        label: 'Instagram Square',
        size: '1024x1024' as const,
        prompt: `Professional social media creative for Instagram. Topic: ${primaryTopic}. Target audience: ${job.target_audience || 'general'}. Brand color: ${brandColor}. Clean, bold, scroll-stopping design. Illustrative/stylistic, not a fake screenshot.`
      },
      {
        platform: 'instagram_story',
        label: 'Instagram Story',
        size: '1024x1536' as const,
        prompt: `Vertical Instagram story creative. Topic: ${primaryTopic}. Target audience: ${job.target_audience || 'general'}. Brand color: ${brandColor}. Bold vertical format.`
      },
      {
        platform: 'tiktok',
        label: 'TikTok Thumbnail',
        size: '1024x1536' as const,
        prompt: `TikTok video thumbnail. Topic: ${primaryTopic}. Attention-grabbing, bold, energetic. Brand color: ${brandColor}. Vertical format.`
      },
      {
        platform: 'youtube',
        label: 'YouTube Thumbnail',
        size: '1536x1024' as const,
        prompt: `YouTube video thumbnail. Topic: ${primaryTopic}. Bold text space on left, visual on right. High contrast. Brand color: ${brandColor}. Horizontal format.`
      },
      {
        platform: 'linkedin',
        label: 'LinkedIn Banner',
        size: '1536x1024' as const,
        prompt: `Professional LinkedIn post image. Topic: ${primaryTopic}. Clean, corporate but engaging. Brand color: ${brandColor}. Horizontal format.`
      },
      {
        platform: 'facebook',
        label: 'Facebook Ad',
        size: '1536x1024' as const,
        prompt: `Facebook ad creative. Topic: ${primaryTopic}. Target audience: ${job.target_audience || 'general'}. Trust-building, professional. Brand color: ${brandColor}.`
      }
    ]

    const { generateImage } = await import('@/lib/atlascloud')

    for (const spec of CREATIVE_SPECS) {
      try {
        // Check if this is a results-focused creative and we have a real asset
        const isResultCreative = spec.prompt.toLowerCase().includes('result') ||
                                 spec.prompt.toLowerCase().includes('testimonial') ||
                                 spec.prompt.toLowerCase().includes('proof')

        let finalUrl: string
        let metadata: any = { type: 'static_creative', size: spec.size }

        if (isResultCreative && resultAssets.length > 0) {
          // Use real uploaded asset instead of generating
          const asset = resultAssets[0] // Use first approved result asset
          const { data: urlData } = supabase.storage
            .from('job-assets')
            .getPublicUrl(asset.file_path)

          finalUrl = urlData.publicUrl
          metadata.used_real_asset = true
          metadata.asset_id = asset.id
        } else {
          // Generate creative via GPT-Image-2
          const result = await generateImage({
            prompt: spec.prompt,
            model: 'gpt-image-2',
            size: spec.size
          })

          if (!result.url) continue

          const imageRes = await fetch(result.url)
          const imageBuffer = Buffer.from(await imageRes.arrayBuffer())
          const filename = `${job.user_id}/${jobId}/creatives/${spec.platform}-${Date.now()}.jpg`

          const { error } = await supabase.storage
            .from('job-assets')
            .upload(filename, imageBuffer, { contentType: 'image/jpeg' })

          if (error) continue

          const { data: urlData } = supabase.storage
            .from('job-assets')
            .getPublicUrl(filename)

          finalUrl = urlData.publicUrl
        }

        await supabase.from('job_outputs').insert({
          job_id: jobId,
          output_type: 'static_creative',
          platform: spec.platform,
          label: spec.label,
          url: finalUrl,
          metadata
        })
      } catch (err) {
        console.error(`Creative generation failed for ${spec.platform}:`, err)
        // Continue — don't kill the job for one failed creative
      }
    }

    await updateStep(supabase, jobId, 'generate-static-creatives', 'completed')

    // Step 4: Generate Instagram carousel
    await updateStep(supabase, jobId, 'generate-instagram-carousel', 'running')

    try {
      // Get Instagram post content
      const { data: instagramOutput } = await supabase
        .from('job_outputs')
        .select('content')
        .eq('job_id', jobId)
        .eq('output_type', 'ad_copy')
        .eq('platform', 'instagram')
        .limit(1)
        .single()

      if (!instagramOutput?.content) {
        await updateStep(supabase, jobId, 'generate-instagram-carousel', 'skipped')
      } else {
        const contentMatch = instagramOutput.content.match(/\{[\s\S]*\}/)
        const instParsed = JSON.parse(contentMatch ? contentMatch[0] : instagramOutput.content)

        // Extract insights from body copy
        const bodyLines = (instParsed.body || '').split('\n').filter(Boolean)
        const insights = bodyLines.slice(0, 5)

        // Build 7 slides
        const slides = [
          { content: instParsed.hook || primaryTopic, slideType: 'hook' as const },
          ...insights.slice(0, 5).map((line: string) => ({
            content: line.replace(/^[•\-✅→\d\.\s]+/, '').trim(),
            slideType: 'insight' as const
          })),
          { content: instParsed.cta || 'Follow for more', slideType: 'cta' as const }
        ].slice(0, 7)

        const businessName = profile?.business_name || 'RunMyPC'
        const handle = profile?.instagram_handle || '@runmypc'

        const outputDir = path.join(process.cwd(), 'tmp', 'carousel', jobId)

        const { renderCarousel } = await import('@/lib/remotionRender')
        const slidePaths = await renderCarousel({
          slides,
          brandColor,
          businessName,
          handle,
          outputDir
        })

        // Upload all slides
        const uploadedUrls: string[] = []

        for (let i = 0; i < slidePaths.length; i++) {
          const slideBuffer = require('fs').readFileSync(slidePaths[i])
          const filename = `${job.user_id}/${jobId}/carousel/slide-${i + 1}.png`

          const { error } = await supabase.storage
            .from('job-assets')
            .upload(filename, slideBuffer, { contentType: 'image/png' })

          if (!error) {
            const { data: urlData } = supabase.storage
              .from('job-assets')
              .getPublicUrl(filename)
            uploadedUrls.push(urlData.publicUrl)
          }

          require('fs').unlinkSync(slidePaths[i])
        }

        if (uploadedUrls.length > 0) {
          await supabase.from('job_outputs').insert({
            job_id: jobId,
            output_type: 'static_creative',
            platform: 'instagram_carousel',
            label: 'Instagram Carousel (7 Slides)',
            url: uploadedUrls[0],
            metadata: {
              type: 'carousel',
              slide_urls: uploadedUrls,
              slide_count: uploadedUrls.length
            }
          })
        }

        await updateStep(supabase, jobId, 'generate-instagram-carousel', 'completed')
      }
    } catch (err) {
      console.error('Carousel generation failed:', err)
      await updateStep(supabase, jobId, 'generate-instagram-carousel', 'failed')
    }

    // Step 5: Generate platform videos via Hyperframes
    await updateStep(supabase, jobId, 'generate-platform-videos', 'running')

    try {
      // TODO: Implement Hyperframes video generation
      // For each platform (Instagram, TikTok, YouTube) generate branded motion graphics video
      // using Hyperframes API with winning angle + brand colors
      console.log('Platform videos via Hyperframes — coming soon')
      await updateStep(supabase, jobId, 'generate-platform-videos', 'skipped')
    } catch (err) {
      console.error('Platform video generation failed:', err)
      await updateStep(supabase, jobId, 'generate-platform-videos', 'failed')
    }

    // Step 6: Generate Remotion social videos
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
              const contentStr = o.content || '{}'
              const contentMatch = contentStr.match(/\{[\s\S]*\}/)
              const parsed = JSON.parse(contentMatch ? contentMatch[0] : contentStr)
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

    // Step 7: Generate cinematic video
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
