const ATLAS_BASE_URL = 'https://api.atlascloud.ai/v1'
const ATLAS_API_KEY = process.env.ATLASCLOUD_API_KEY!

type GenerationStatus = 'pending' | 'processing' | 'completed' | 'failed'

type VideoGenerationResult = {
  id: string
  status: GenerationStatus
  output_url?: string
  error?: string
}

export async function generateVideo(params: {
  prompt: string
  referenceImageUrls?: string[]
  duration?: number
  aspectRatio?: '9:16' | '16:9' | '1:1'
  model?: string
}): Promise<VideoGenerationResult> {
  const {
    prompt,
    referenceImageUrls = [],
    duration = 5,
    aspectRatio = '9:16',
    model = 'seedance-2.0-reference-to-video-fast'
  } = params

  // Start generation
  const startRes = await fetch(`${ATLAS_BASE_URL}/video/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ATLAS_API_KEY}`
    },
    body: JSON.stringify({
      model,
      prompt,
      reference_images: referenceImageUrls,
      duration,
      aspect_ratio: aspectRatio
    })
  })

  if (!startRes.ok) {
    const error = await startRes.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(`Atlas Cloud error: ${error.error || startRes.status}`)
  }

  const { id } = await startRes.json()

  // Poll for completion
  let attempts = 0
  const maxAttempts = 60 // 5 minutes max

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 5000))

    const statusRes = await fetch(`${ATLAS_BASE_URL}/video/${id}`, {
      headers: { 'Authorization': `Bearer ${ATLAS_API_KEY}` }
    })

    const result = await statusRes.json()

    if (result.status === 'completed' && result.output_url) {
      return { id, status: 'completed', output_url: result.output_url }
    }

    if (result.status === 'failed') {
      return { id, status: 'failed', error: result.error }
    }

    attempts++
  }

  return { id, status: 'failed', error: 'Generation timed out' }
}

export async function generateImage(params: {
  prompt: string
  referenceImageUrls?: string[]
  model?: string
  size?: string
}): Promise<{ url: string }> {
  const {
    prompt,
    size = '1024x1024'
  } = params

  // Fallback to OpenAI DALL-E (Atlas Cloud API currently unavailable)
  const openai = await import('openai').then(m => new m.default({ apiKey: process.env.OPENAI_API_KEY }))

  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt: prompt.slice(0, 4000), // DALL-E has 4000 char limit
    n: 1,
    size: size === '1024x1536' ? '1024x1792' : '1024x1024', // Map to DALL-E sizes
    quality: 'standard'
  })

  if (!response.data?.[0]?.url) {
    throw new Error('DALL-E returned no image URL')
  }

  return { url: response.data[0].url }
}
