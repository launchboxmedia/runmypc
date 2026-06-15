import { withRetry } from '@/lib/retry'

const APIFY_BASE_URL = 'https://api.apify.com/v2'
const APIFY_TOKEN = process.env.APIFY_API_TOKEN!

export async function runApifyActor(actorId: string, input: Record<string, unknown>) {
  return withRetry(
    async () => {
      // Apify API uses tilde separator in actor IDs
      const apiActorId = actorId.replace('/', '~')

      const startRes = await fetch(
        `${APIFY_BASE_URL}/acts/${apiActorId}/runs?token=${APIFY_TOKEN}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input)
        }
      )

      const startBody = await startRes.json()
      console.log(`[Apify] Start ${actorId}: status=${startRes.status}`)

      const { data: run } = startBody
      const runId = run.id

      let status = 'RUNNING'
      while (status === 'RUNNING' || status === 'READY') {
        await new Promise(resolve => setTimeout(resolve, 5000))
        const statusRes = await fetch(`${APIFY_BASE_URL}/actor-runs/${runId}?token=${APIFY_TOKEN}`)
        const { data } = await statusRes.json()
        status = data.status
        console.log(`[Apify] Status ${actorId} (${runId}): ${status}`)
      }

      if (status !== 'SUCCEEDED') {
        console.error(`[Apify] FAILED ${actorId}: ${status}`)
        throw new Error(`Apify actor failed with status: ${status}`)
      }

      const resultsRes = await fetch(
        `${APIFY_BASE_URL}/actor-runs/${runId}/dataset/items?token=${APIFY_TOKEN}`
      )
      const results = await resultsRes.json()
      console.log(`[Apify] Results ${actorId}: ${results.length} items`)
      return results
    },
    {
      maxAttempts: 3,
      delayMs: 3000,
      onRetry: (attempt, error) => {
        console.log(`Apify actor ${actorId} retry ${attempt}:`, error.message)
      }
    }
  )
}

export async function scrapeNicheContent(niche: string) {
  const [instagramResults, tiktokResults, youtubeResults, linkedinResults] = await Promise.all([
    runApifyActor('apify/instagram-scraper', {
      directUrls: [`https://www.instagram.com/explore/tags/${encodeURIComponent(niche.replace(/\s+/g, ''))}/`],
      resultsType: 'posts',
      resultsLimit: 10
    }).catch((err) => {
      console.error('[Apify] Instagram scraper failed:', err)
      return []
    }),

    runApifyActor('clockworks/tiktok-scraper', {
      hashtags: [niche.replace(/\s+/g, '')],
      resultsPerPage: 10
    }).catch((err) => {
      console.error('[Apify] TikTok scraper failed:', err)
      return []
    }),

    runApifyActor('streamers/youtube-scraper', {
      searchQueries: [niche],
      maxResults: 10
    }).catch((err) => {
      console.error('[Apify] YouTube scraper failed:', err)
      return []
    }),

    runApifyActor('harvestapi/linkedin-post-search', {
      searchQueries: [niche],
      maxPosts: 10
    }).catch((err) => {
      console.error('[Apify] LinkedIn scraper failed:', err)
      return []
    })
  ])

  return [...instagramResults, ...tiktokResults, ...youtubeResults, ...linkedinResults]
}

export async function scrapeNicheAds(niche: string) {
  return runApifyActor('curious_coder/facebook-ads-library-scraper', {
    urls: [`https://www.facebook.com/ads/library/?q=${encodeURIComponent(niche)}&ad_type=all`],
    limitPerUrl: 20
  })
}
