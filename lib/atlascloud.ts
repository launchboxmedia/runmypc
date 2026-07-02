const ATLAS_BASE_URL = 'https://api.atlascloud.ai/api/v1'
const ATLAS_API_KEY = process.env.ATLASCLOUD_API_KEY!

type GenerationStatus = 'pending' | 'processing' | 'completed' | 'failed'

type VideoGenerationResult = {
  id: string
  status: GenerationStatus
  output_url?: string
  error?: string
}

export async function uploadMedia(imageUrl: string): Promise<string> {
  // Download image
  const imageRes = await fetch(imageUrl)
  const imageBlob = await imageRes.blob()

  // Upload to Atlas
  const formData = new FormData()
  formData.append('file', imageBlob)

  const uploadRes = await fetch(`${ATLAS_BASE_URL}/model/uploadMedia`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${ATLAS_API_KEY}` },
    body: formData
  })

  if (!uploadRes.ok) {
    const error = await uploadRes.json().catch(() => ({ error: 'Upload failed' }))
    throw new Error(`Atlas upload error: ${error.msg || error.error || uploadRes.status}`)
  }

  const { url } = await uploadRes.json()
  return url
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
    model = 'bytedance/seedance-2.0/text-to-video'
  } = params

  // Upload reference image if provided
  let atlasImageUrl: string | undefined
  if (referenceImageUrls.length > 0) {
    atlasImageUrl = await uploadMedia(referenceImageUrls[0])
  }

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
      ...(atlasImageUrl && { image_url: atlasImageUrl })
    })
  })

  if (!startRes.ok) {
    const error = await startRes.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(`Atlas Cloud error: ${error.msg || error.error || startRes.status}`)
  }

  const response = await startRes.json()
  const predictionId = response.data.id

  // Poll for completion
  let attempts = 0
  const maxAttempts = 120 // 10 minutes max for video

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 5000))

    const statusRes = await fetch(`${ATLAS_BASE_URL}/model/prediction/${predictionId}`, {
      headers: { 'Authorization': `Bearer ${ATLAS_API_KEY}` }
    })

    const result = await statusRes.json()

    if (result.data.status === 'completed' && result.data.outputs?.[0]) {
      return { id: predictionId, status: 'completed', output_url: result.data.outputs[0] }
    }

    if (result.data.status === 'failed') {
      return { id: predictionId, status: 'failed', error: result.data.error }
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
    model = 'openai/gpt-image-2/text-to-image',
    size
  } = params

  const res = await fetch(`${ATLAS_BASE_URL}/model/generateImage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ATLAS_API_KEY}`
    },
    body: JSON.stringify({
      model,
      prompt,
      ...(size && { size })
    })
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(`Atlas Cloud image error: ${error.msg || error.error || res.status}`)
  }

  const response = await res.json()
  const predictionId = response.data.id

  // Poll for result
  let attempts = 0
  const maxAttempts = 60 // 5 minutes

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 2000))

    const statusRes = await fetch(`${ATLAS_BASE_URL}/model/prediction/${predictionId}`, {
      headers: { 'Authorization': `Bearer ${ATLAS_API_KEY}` }
    })

    const result = await statusRes.json()

    if (result.data.status === 'completed' && result.data.outputs?.[0]) {
      return { url: result.data.outputs[0] }
    }

    if (result.data.status === 'failed') {
      throw new Error(`Image generation failed: ${result.data.error || 'Unknown error'}`)
    }

    attempts++
  }

  throw new Error('Image generation timed out')
}
