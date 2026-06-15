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
    referenceImageUrls = [],
    model = 'gpt-image-2',
    size = '1024x1024'
  } = params

  const res = await fetch(`${ATLAS_BASE_URL}/image/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ATLAS_API_KEY}`
    },
    body: JSON.stringify({
      model,
      prompt,
      reference_images: referenceImageUrls,
      size
    })
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(`Atlas Cloud image error: ${error.error || res.status}`)
  }

  const result = await res.json()
  return { url: result.url || result.output_url }
}
