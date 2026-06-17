// Firecrawl API integration for content extraction
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY

export async function scrapeUrl(url: string): Promise<{
  content: string
  title?: string
  url: string
}> {
  if (!FIRECRAWL_API_KEY) {
    throw new Error('FIRECRAWL_API_KEY not configured')
  }

  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${FIRECRAWL_API_KEY}`
    },
    body: JSON.stringify({
      url,
      formats: ['markdown']
    })
  })

  if (!response.ok) {
    throw new Error(`Firecrawl scrape failed: ${response.statusText}`)
  }

  const data = await response.json()

  return {
    content: data.markdown || data.content || '',
    title: data.metadata?.title,
    url: data.metadata?.url || url
  }
}

export async function scrapeMultipleUrls(urls: string[]): Promise<Array<{
  content: string
  title?: string
  url: string
}>> {
  const results = await Promise.allSettled(
    urls.map(url => scrapeUrl(url))
  )

  return results
    .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
    .map(r => r.value)
}
