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

// v1 social gate — Instagram + TikTok only. YouTube + LinkedIn are v2.
// This GATES dispatch (research + generation); it does not remove the code.
// Un-gate for v2 by adding the platforms back to this list.
const V1_SOCIAL_PLATFORMS = ['instagram', 'tiktok']

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

    // Step 0: Semantic expansion - convert flat term into platform-optimized variants
    const extractionResponse = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Analyze this niche and generate platform-optimized search terms. Use colloquial language creators actually use - hooks, hacks, secrets, tips are all valid.

Topic: ${job.topic}
Target audience: ${job.target_audience || ''}
What they learn: ${job.outcome || ''}

Respond ONLY with JSON:
{
  "is_b2b": boolean,
  "social_keywords": ["exactly 3 search phrases for TikTok/YouTube"],
  "hashtags": ["exactly 3 hashtags without # symbol for Instagram"],
  "reddit_queries": ["exactly 2 search phrases for site-wide old.reddit.com"]
}

Requirements:
- Use how real people talk and search in this niche (emotional symptoms, tactics, slang)
- NOT clinical industry terms unless that's genuinely how the audience searches
- Fixed caps: 3 social keywords, 3 hashtags, 2 Reddit queries
- Reddit queries find topic/question threads, default to site-wide search
- is_b2b = true only if targeting businesses/professionals

No examples provided - reason fresh per niche.`
      }]
    })

    const extractionText = extractionResponse.content[0].type === 'text' ? extractionResponse.content[0].text : '{}'
    const jsonMatch = extractionText.match(/\{[\s\S]*\}/)
    const extraction = JSON.parse(jsonMatch ? jsonMatch[0] : '{}')
    const isB2B = extraction.is_b2b || false

    // Extract with fallbacks to raw topic
    const socialKeywords = (extraction.social_keywords || []).slice(0, 3)
    if (socialKeywords.length === 0) socialKeywords.push(job.topic)

    const hashtags = (extraction.hashtags || []).slice(0, 3)
    if (hashtags.length === 0) hashtags.push(job.topic.replace(/\s+/g, ''))

    const redditQueries = (extraction.reddit_queries || []).slice(0, 2)
    if (redditQueries.length === 0) redditQueries.push(job.topic)

    const primaryTerm = socialKeywords[0]

    console.log('Semantic expansion:', { socialKeywords, hashtags, redditQueries, isB2B })

    // LAYER 1 — Search Intent via Autocomplete
    const { runApifyActor } = await import('@/lib/apify')
    const autocompleteResults = await runApifyActor('easyapi/keyword-suggestions-scraper', {
      keyword: job.topic,
      platforms: ['google', 'youtube', 'tiktok', 'instagram'],
      maxSuggestions: 20
    }).catch(() => [])

    // LAYER 2 — Social content scraping (parallel)
    // Instagram: use semantic hashtags for better content discovery
    const instagramHashtagResults = await runApifyActor('apify/instagram-hashtag-scraper', {
      hashtags: hashtags,
      resultsLimit: 30
    }).catch(() => [])

    console.log(`Instagram hashtag scraper returned ${instagramHashtagResults.length} results`)
    if (instagramHashtagResults.length > 0) {
      console.log('Sample hashtag result fields:', Object.keys(instagramHashtagResults[0]))
    }

    let instagramUsernames = [
      ...new Set(
        instagramHashtagResults
          .slice(0, 10)
          .map((p: any) => {
            // Try multiple possible username field locations
            const username = p.ownerUsername || p.username || p.owner?.username || p.user?.username
            return username
          })
          .filter(Boolean)
      )
    ].slice(0, 5)

    // Fallback: use profile research usernames if extraction yielded no results
    if (instagramUsernames.length === 0 && profile?.research_instagram_usernames) {
      instagramUsernames = profile.research_instagram_usernames
        .split(',')
        .map((u: string) => u.trim().replace('@', ''))
        .filter(Boolean)
        .slice(0, 5)
      console.log(`No usernames from hashtag — using profile research usernames: ${instagramUsernames.join(', ')}`)
    }

    console.log(`Extracted ${instagramUsernames.length} usernames:`, instagramUsernames)

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
      // TikTok - use social keywords with fallback
      (async () => {
        for (const keyword of socialKeywords) {
          const results = await runApifyActor('clockworks/tiktok-scraper', {
            hashtags: [keyword.replace(/\s+/g, '')],
            resultsPerPage: 15
          }).catch(() => [])
          if (results.length > 0) {
            console.log(`TikTok scraper succeeded with keyword: ${keyword}`)
            return results
          }
        }
        console.log('TikTok scraper: all keywords returned 0 results')
        return []
      })(),

      // YouTube - use social keywords with fallback (v1-gated: skipped unless un-gated for v2)
      V1_SOCIAL_PLATFORMS.includes('youtube')
        ? (async () => {
            for (const keyword of socialKeywords) {
              const results = await runApifyActor('streamers/youtube-scraper', {
                searchQueries: [keyword],
                maxResults: 15
              }).catch(() => [])
              if (results.length > 0) {
                console.log(`YouTube scraper succeeded with keyword: ${keyword}`)
                return results
              }
            }
            console.log('YouTube scraper: all keywords returned 0 results')
            return []
          })()
        : Promise.resolve([]),

      // LinkedIn (only if B2B, and v1-gated)
      isB2B && V1_SOCIAL_PLATFORMS.includes('linkedin')
        ? runApifyActor('harvestapi/linkedin-post-search', {
            searchQueries: [primaryTerm],
            maxPosts: 15
          }).catch(() => [])
        : Promise.resolve([]),

      // Reddit via Firecrawl - use reddit_queries with fallback
      (async () => {
        try {
          const { scrapeUrl } = await import('@/lib/firecrawl')
          for (const query of redditQueries) {
            const redditUrl = `https://old.reddit.com/search?q=${encodeURIComponent(query)}&sort=relevance&t=month`
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

            if (threads.length > 0) {
              console.log(`Reddit scraper succeeded with query: ${query}`)
              return threads
            }
          }
          console.log('Reddit scraper: all queries returned 0 results')
          return []
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
        niche_classification: { is_b2b: isB2B, social_keywords: socialKeywords, hashtags, reddit_queries: redditQueries },
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

    for (const platform of PLATFORMS.filter(p => V1_SOCIAL_PLATFORMS.includes(p))) {
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
          output_type: 'social_post',
          platform,
          label: `${platform} Post ${i + 1}`,
          // content kept as the raw JSON post for back-compat with downstream
          // parsers (carousel, Hyperframes) and the UI copy button.
          content: JSON.stringify(post),
          metadata: {
            type: 'social_post',
            platform,
            hook: post.hook ?? null,
            body: post.body ?? null,
            cta: post.cta ?? null,
            hashtags: Array.isArray(post.hashtags) ? post.hashtags : [],
            research_grounding: {
              source: selectedTopics[0]?.source || 'fallback',
              topic_used: primaryTopic,
              format_pattern: formatData.hook_patterns?.[0] || null
            }
          }
        }))
      )
    }

    await updateStep(supabase, jobId, 'generate-social-copy', 'completed')

    // Step 3: Generate static creatives (all platforms via Atlas Cloud)
    await updateStep(supabase, jobId, 'generate-static-creatives', 'running')
    await notifyStep(supabase, job.user_id, 'Creating static visuals', 'content_generation')

    // Neutral fallback when the customer has no brand color set — never RunMyPC's.
    const brandColor = profile?.brand_colors?.split(',')[0]?.trim() || '#111827'

    // Fetch selected business assets for static creatives
    // Only use assets explicitly selected for this job
    const { data: selectedAssetJoins } = await supabase
      .from('job_selected_assets')
      .select('asset_id, business_assets!inner(*)')
      .eq('job_id', jobId)

    const selectedAssets = selectedAssetJoins
      ?.map((join: any) => join.business_assets)
      .filter((asset: any) =>
        asset &&
        asset.status === 'approved' &&
        (asset.usable_in === 'static' || asset.usable_in === 'both')
      ) || []

    const resultFacts = businessFacts.filter(f => f.type === 'result')

    // Get assets linked to result facts (from selected assets only)
    const resultAssets = selectedAssets.filter(a =>
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
        let storagePath: string
        let metadata: any = {
          type: 'static_creative',
          size: spec.size,
          research_grounding: {
            topic_used: primaryTopic,
            source: selectedTopics[0]?.source || 'fallback',
            format_pattern: formatData.hook_patterns?.[0] || null
          }
        }

        if (isResultCreative && resultAssets.length > 0) {
          // Use real uploaded asset instead of generating
          const asset = resultAssets[0] // Use first approved result asset
          storagePath = asset.file_path

          const { data: urlData } = await supabase.storage
            .from('job-assets')
            .createSignedUrl(storagePath, 3600) // 1 hour expiry

          finalUrl = urlData?.signedUrl || ''
          metadata.used_real_asset = true
          metadata.asset_id = asset.id
          metadata.storage_path = storagePath
        } else {
          // Generate creative via GPT-Image-2
          console.log(`Generating ${spec.platform} creative via Atlas Cloud...`)
          const result = await generateImage({
            prompt: spec.prompt,
            // model param ignored - atlascloud.ts uses default
            size: spec.size
          })

          if (!result.url) {
            console.error(`No URL returned for ${spec.platform}`)
            continue
          }
          console.log(`${spec.platform} creative generated:`, result.url)

          const imageRes = await fetch(result.url)
          const imageBuffer = Buffer.from(await imageRes.arrayBuffer())
          const filename = `${job.user_id}/${jobId}/creatives/${spec.platform}-${Date.now()}.jpg`

          const { error } = await supabase.storage
            .from('job-assets')
            .upload(filename, imageBuffer, { contentType: 'image/jpeg' })

          if (error) continue

          storagePath = filename
          const { data: urlData } = await supabase.storage
            .from('job-assets')
            .createSignedUrl(storagePath, 3600) // 1 hour expiry

          finalUrl = urlData?.signedUrl || ''
          metadata.storage_path = storagePath
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
        const errorMsg = err instanceof Error ? err.message : String(err)
        console.error(`Creative generation failed for ${spec.platform}:`, errorMsg)
        console.error('Full error:', err)

        // Store error as output for visibility
        await supabase.from('job_outputs').insert({
          job_id: jobId,
          output_type: 'error',
          platform: spec.platform,
          label: `${spec.label} Error`,
          content: JSON.stringify({ error: errorMsg, timestamp: new Date().toISOString() }),
          metadata: { type: 'generation_error', step: 'static_creative' }
        })

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
        .eq('output_type', 'social_post')
        .eq('platform', 'instagram')
        .limit(1)
        .single()

      if (!instagramOutput?.content) {
        await updateStep(supabase, jobId, 'generate-instagram-carousel', 'skipped')
      } else {
        const contentMatch = instagramOutput.content.match(/\{[\s\S]*\}/)
        const instParsed = JSON.parse(contentMatch ? contentMatch[0] : instagramOutput.content)

        // Optional cover visual: first selected approved IMAGE asset (static/both).
        let selectedAssetUrl: string | null = null
        const coverAsset = selectedAssets.find((a: any) =>
          typeof a.file_type === 'string' && a.file_type.startsWith('image')
        )
        if (coverAsset?.file_path) {
          const { data: signed } = await supabase.storage
            .from('job-assets')
            .createSignedUrl(coverAsset.file_path, 3600)
          selectedAssetUrl = signed?.signedUrl || null
        }

        // Phase C: design-system carousel — resolve style, plan dynamic slides
        // (cover=hook first, single CTA last), generate per-slide HTML, render
        // PNGs via the static render service, quality-gate with retries.
        const { generateCarousel } = await import('@/lib/carousel/generateCarousel')
        const result = await generateCarousel({
          job,
          profile,
          igPost: {
            hook: instParsed.hook || primaryTopic,
            body: instParsed.body || '',
            cta: instParsed.cta || 'Follow for more',
          },
          selectedAssetUrl,
        })

        // Upload all slides. Store storage PATHS (not public URLs) — job-assets
        // is private; signed URLs get regenerated at read time.
        const slideStoragePaths: string[] = []
        const uploadedUrls: string[] = []

        for (let i = 0; i < result.slides.length; i++) {
          const filename = `${job.user_id}/${jobId}/carousel/slide-${i + 1}.png`

          const { error } = await supabase.storage
            .from('job-assets')
            .upload(filename, result.slides[i].png, { contentType: 'image/png', upsert: true })

          if (!error) {
            slideStoragePaths.push(filename)
            const { data: urlData } = await supabase.storage
              .from('job-assets')
              .createSignedUrl(filename, 3600) // 1 hour expiry
            if (urlData?.signedUrl) uploadedUrls.push(urlData.signedUrl)
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
              design_source: result.resolved.source,
              style_id: result.resolved.style_id,
            }
          })

          // Persist the resolved design system onto the job (jobs-only writer).
          const { persistJobStyle } = await import('@/lib/designSystem/persistJobStyle')
          await persistJobStyle(jobId, result.resolved).catch(err =>
            console.error('persistJobStyle failed:', err)
          )
        }

        await updateStep(supabase, jobId, 'generate-instagram-carousel', 'completed')
      }
    } catch (err) {
      console.error('Carousel generation failed:', err)
      await updateStep(supabase, jobId, 'generate-instagram-carousel', 'failed')
    }

    // Step 5: Generate social videos via Hyperframes (agent-driven compositions).
    // One social_video per social_post. Brand-neutral; works with zero assets.
    await updateStep(supabase, jobId, 'generate-platform-videos', 'running')
    await notifyStep(supabase, job.user_id, 'Generating social videos', 'content_generation')

    try {
      const { isHyperframesConfigured, generateAllSocialVideos } = await import('@/lib/hyperframes')

      if (!isHyperframesConfigured()) {
        console.log('[Hyperframes] HYPERFRAMES_RENDER_URL not set — skipping social videos')
        await updateStep(supabase, jobId, 'generate-platform-videos', 'skipped')
      } else {
        // Get social posts
        const { data: socialOutputs } = await supabase
          .from('job_outputs')
          .select('*')
          .eq('job_id', jobId)
          .eq('output_type', 'social_post')

        // Fetch selected business assets for video composition.
        // Only assets explicitly selected for this job. Optional.
        const { data: selectedAssetJoins } = await supabase
          .from('job_selected_assets')
          .select('asset_id, business_assets!inner(*)')
          .eq('job_id', jobId)

        const businessAssets = selectedAssetJoins
          ?.map((join: any) => join.business_assets)
          .filter((asset: any) =>
            asset &&
            asset.status === 'approved' &&
            (asset.usable_in === 'video' || asset.usable_in === 'both')
          ) || []

        const posts = (socialOutputs || [])
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

        console.log(`[Hyperframes] Found ${posts.length} social posts for video generation`)

        if (posts.length === 0) {
          await updateStep(supabase, jobId, 'generate-platform-videos', 'skipped')
        } else {
          const videos = await generateAllSocialVideos({
            posts,
            businessAssets: businessAssets || []
          })

          for (const video of videos) {
            try {
              // Render service returns a public MP4 URL (Vercel Blob).
              // Download + re-upload to our storage for persistence.
              const videoRes = await fetch(video.mp4Url)
              const videoBuffer = Buffer.from(await videoRes.arrayBuffer())
              const filename = `${job.user_id}/${jobId}/videos/${video.platform}-social-${video.postIndex}-${Date.now()}.mp4`

              const { error: uploadError } = await supabase.storage
                .from('job-assets')
                .upload(filename, videoBuffer, { contentType: 'video/mp4' })

              if (!uploadError) {
                const { data: urlData } = await supabase.storage
                  .from('job-assets')
                  .createSignedUrl(filename, 3600) // 1 hour expiry

                await supabase.from('job_outputs').insert({
                  job_id: jobId,
                  output_type: 'social_video',
                  platform: video.platform,
                  label: `${video.platform} Video`,
                  url: urlData?.signedUrl || '',
                  metadata: {
                    type: 'hyperframes_video',
                    platform: video.platform,
                    post_index: video.postIndex,
                    storage_path: filename,
                    research_grounding: {
                      topic_used: primaryTopic,
                      source: selectedTopics[0]?.source || 'fallback',
                      format_pattern: formatData.hook_patterns?.[0] || null
                    }
                  }
                })
              }
            } catch (err) {
              console.error(`Failed to upload social video for ${video.platform}:`, err)
            }
          }

          await updateStep(supabase, jobId, 'generate-platform-videos', 'completed')
        }
      }
    } catch (err) {
      console.error('Social video generation failed:', err)
      await updateStep(supabase, jobId, 'generate-platform-videos', 'failed')
    }

    // Step 6: Remotion motion-video generation — CANCELLED
    // Reasoning: Hyperframes (Step 5) serves the same platform-video role.
    // Remotion stays in the stack only for carousel static rendering (Step 4).
    // No AWS Lambda setup needed for this cancelled step.
    await updateStep(supabase, jobId, 'generate-remotion-videos', 'skipped')

    // Step 7: Generate cinematic hero video (Seedance via Atlas Cloud).
    // Brand-neutral: built from the customer's niche/topic. Uses the customer's
    // own selected business assets as references when available; otherwise runs
    // text-to-video. Runs for every job.
    {
      await updateStep(supabase, jobId, 'generate-cinematic-video', 'running')
      await notifyStep(supabase, job.user_id, 'Generating cinematic video', 'content_generation')

      try {
        console.log('[Atlas Cloud] Starting cinematic video generation...')
        const { generateVideo } = await import('@/lib/atlascloud')

        // Fetch selected topics from niche research
        const { data: researchOutput } = await supabase
          .from('job_outputs')
          .select('content, metadata')
          .eq('job_id', jobId)
          .eq('output_type', 'niche_research')
          .single()

        let selectedTopic = job.topic
        if (researchOutput?.content) {
          try {
            const research = JSON.parse(researchOutput.content)
            selectedTopic = research.selected_topics?.[0]?.title || job.topic
          } catch {}
        }

        // Fetch business facts for context
        const { data: businessFacts } = await supabase
          .from('business_facts')
          .select('content, type')
          .eq('user_id', job.user_id)
          .limit(5)

        const factsContext = businessFacts?.map(f => f.content).join('; ').substring(0, 300) || ''

        // Customer's own selected, video-usable assets as references (optional).
        const { data: cinematicAssetJoins } = await supabase
          .from('job_selected_assets')
          .select('asset_id, business_assets!inner(*)')
          .eq('job_id', jobId)

        const referenceImages = (cinematicAssetJoins || [])
          .map((join: any) => join.business_assets)
          .filter((asset: any) =>
            asset &&
            asset.status === 'approved' &&
            (asset.usable_in === 'video' || asset.usable_in === 'both')
          )
          .map((asset: any) => asset.file_path)
          .filter(Boolean) as string[]

        // Brand-neutral cinematic prompt — works for any niche.
        const prompt = `A bold, modern cinematic vertical video about: ${selectedTopic}.
${factsContext ? `Key context: ${factsContext}` : ''}
Style: high production value, dynamic camera movement, clean professional lighting,
strong visual storytelling. Cohesive, contemporary aesthetic suited to the topic.
9:16 vertical format for social media.
No text overlay. Pure visual storytelling.`

      const result = await generateVideo({
        prompt,
        referenceImageUrls: referenceImages,
        duration: 5,
        aspectRatio: '9:16',
        model: referenceImages.length > 0
          ? 'bytedance/seedance-2.0/reference-to-video'
          : 'bytedance/seedance-2.0/text-to-video'
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
          const { data: urlData } = await supabase.storage
            .from('job-assets')
            .createSignedUrl(filename, 3600) // 1 hour expiry

          await supabase.from('job_outputs').insert({
            job_id: jobId,
            output_type: 'cinematic_video',
            platform: null,
            label: 'Hero Cinematic Video',
            url: urlData?.signedUrl || '',
            metadata: {
              type: 'atlas_cloud_video',
              model: 'seedance-2.0',
              duration: 5,
              atlas_id: result.id,
              storage_path: filename,
              research_grounding: {
                topic_used: primaryTopic,
                source: selectedTopics[0]?.source || 'fallback',
                format_pattern: formatData.hook_patterns?.[0] || null
              }
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
