const ATLAS_BASE_URL = 'https://api.atlascloud.ai/api/v1'
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
    model = 'kling-v2.0'
  } = params

  // Start generation
  const startRes = await fetch(`${ATLAS_BASE_URL}/model/generateVideo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ATLAS_API_KEY}`
    },
    body: JSON.stringify({
      model,
      prompt,
      ...(referenceImageUrls.length > 0 && { image: referenceImageUrls[0] })
    })
  })

  if (!startRes.ok) {
    const error = await startRes.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(`Atlas Cloud error: ${error.error || startRes.status}`)
  }

  const { predictionId } = await startRes.json()

  // Poll for completion
  let attempts = 0
  const maxAttempts = 120 // 10 minutes max for video

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 5000))

    const statusRes = await fetch(`${ATLAS_BASE_URL}/model/getResult?predictionId=${predictionId}`, {
      headers: { 'Authorization': `Bearer ${ATLAS_API_KEY}` }
    })

    const result = await statusRes.json()

    if (result.status === 'succeeded' && result.output) {
      return { id: predictionId, status: 'completed', output_url: result.output }
    }

    if (result.status === 'failed') {
      return { id: predictionId, status: 'failed', error: result.error }
    }

    attempts++
  }

  return { id: predictionId, status: 'failed', error: 'Generation timed out' }
}

export async function generateImage(params: {
  prompt: string
  referenceImageUrls?: string[]
  model?: string
  size?: string
}): Promise<{ url: string }> {
  const {
    prompt,
    model = 'flux-1.1-pro'
  } = params

  const res = await fetch(`${ATLAS_BASE_URL}/model/generateImage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ATLAS_API_KEY}`
    },
    body: JSON.stringify({
      model,
      prompt
    })
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(`Atlas Cloud image error: ${error.error || res.status}`)
  }

  const { predictionId } = await res.json()

  // Poll for result
  let attempts = 0
  const maxAttempts = 60 // 5 minutes

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 2000))

    const statusRes = await fetch(`${ATLAS_BASE_URL}/model/getResult?predictionId=${predictionId}`, {
      headers: { 'Authorization': `Bearer ${ATLAS_API_KEY}` }
    })

    const result = await statusRes.json()

    if (result.status === 'succeeded' && result.output) {
      return { url: result.output }
    }

    if (result.status === 'failed') {
      throw new Error(`Image generation failed: ${result.error || 'Unknown error'}`)
    }

    attempts++
  }

  throw new Error('Image generation timed out')
}
