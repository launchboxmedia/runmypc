import { createAdminClient } from '@/lib/supabase/admin'
import Anthropic from '@anthropic-ai/sdk'
import type { BusinessFact, BusinessAsset, BusinessFactType } from '@/types/business'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// CRUD for business facts
export async function getBusinessFacts(userId: string, options?: {
  type?: BusinessFactType
  serviceTag?: string
}) {
  const supabase = createAdminClient()
  let query = supabase
    .from('business_facts')
    .select('*')
    .eq('user_id', userId)

  if (options?.type) {
    query = query.eq('type', options.type)
  }

  if (options?.serviceTag) {
    query = query.eq('service_tag', options.serviceTag)
  }

  const { data, error } = await query
  if (error) throw error
  return data as BusinessFact[]
}

export async function createBusinessFact(data: {
  userId: string
  type: BusinessFactType
  content: string
  serviceTag?: string
}) {
  const supabase = createAdminClient()
  const { data: fact, error } = await supabase
    .from('business_facts')
    .insert({
      user_id: data.userId,
      type: data.type,
      content: data.content,
      service_tag: data.serviceTag
    })
    .select()
    .single()

  if (error) throw error
  return fact as BusinessFact
}

export async function updateBusinessFact(factId: string, updates: {
  content?: string
  serviceTag?: string
  type?: BusinessFactType
}) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('business_facts')
    .update(updates)
    .eq('id', factId)
    .select()
    .single()

  if (error) throw error
  return data as BusinessFact
}

export async function deleteBusinessFact(factId: string) {
  const supabase = createAdminClient()
  // This will cascade delete linked assets via ON DELETE SET NULL
  const { error } = await supabase
    .from('business_facts')
    .delete()
    .eq('id', factId)

  if (error) throw error
}

// Asset management
export async function getBusinessAssets(userId: string, options?: {
  status?: string
  businessFactId?: string
}) {
  const supabase = createAdminClient()
  let query = supabase
    .from('business_assets')
    .select('*')
    .eq('user_id', userId)

  if (options?.status) {
    query = query.eq('status', options.status)
  }

  if (options?.businessFactId) {
    query = query.eq('business_fact_id', options.businessFactId)
  }

  const { data, error } = await query
  if (error) throw error
  return data as BusinessAsset[]
}

export async function checkAssetLimit(userId: string): Promise<boolean> {
  const supabase = createAdminClient()

  // Get user's max assets from profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('max_business_assets')
    .eq('id', userId)
    .single()

  const maxAssets = profile?.max_business_assets || 20

  // Count current assets
  const { count } = await supabase
    .from('business_assets')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  return (count || 0) < maxAssets
}

// PII detection using Claude vision
export async function detectPII(imageUrl: string): Promise<{
  has_pii: boolean
  pii_types?: string[]
  confidence?: number
}> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'url',
              url: imageUrl
            }
          },
          {
            type: 'text',
            text: `Analyze this image for visible personally identifiable information (PII).

Look for:
- Full names (first + last)
- Account numbers (credit card, bank account, SSN)
- Full addresses (street address, not just city/state)
- Email addresses
- Phone numbers

Scores/numbers/percentages alone are OK.
Business names alone are OK.
First names only are OK.

Respond ONLY with JSON:
{
  "has_pii": boolean,
  "pii_types": ["type1", "type2"],
  "confidence": 0-100
}`
          }
        ]
      }]
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
    const result = JSON.parse(text.replace(/```json|```/g, '').trim())

    return {
      has_pii: result.has_pii || false,
      pii_types: result.pii_types || [],
      confidence: result.confidence || 0
    }
  } catch (error) {
    console.error('PII detection failed:', error)
    // Fail safe - if we can't check, assume no PII
    return { has_pii: false }
  }
}

export async function uploadBusinessAsset(data: {
  userId: string
  businessFactId?: string
  file: File
}): Promise<BusinessAsset> {
  const supabase = createAdminClient()

  // Check asset limit first
  const canUpload = await checkAssetLimit(data.userId)
  if (!canUpload) {
    throw new Error('Asset limit reached')
  }

  // Upload to storage
  const filename = `${data.userId}/business-assets/${Date.now()}-${data.file.name}`
  const { error: uploadError } = await supabase.storage
    .from('job-assets')
    .upload(filename, data.file, { contentType: data.file.type })

  if (uploadError) throw uploadError

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('job-assets')
    .getPublicUrl(filename)

  // Run PII check
  const piiCheck = await detectPII(urlData.publicUrl)

  // Create asset record
  const { data: asset, error } = await supabase
    .from('business_assets')
    .insert({
      user_id: data.userId,
      business_fact_id: data.businessFactId,
      file_path: filename,
      file_type: 'image',
      status: piiCheck.has_pii ? 'rejected' : 'pending_review',
      pii_check_result: piiCheck,
      rejection_reason: piiCheck.has_pii
        ? `Contains PII: ${piiCheck.pii_types?.join(', ')}`
        : undefined
    })
    .select()
    .single()

  if (error) throw error
  return asset as BusinessAsset
}

export async function approveAsset(assetId: string) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('business_assets')
    .update({ status: 'approved' })
    .eq('id', assetId)
    .select()
    .single()

  if (error) throw error
  return data as BusinessAsset
}

export async function rejectAsset(assetId: string, reason: string) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('business_assets')
    .update({
      status: 'rejected',
      rejection_reason: reason
    })
    .eq('id', assetId)
    .select()
    .single()

  if (error) throw error
  return data as BusinessAsset
}

export async function deleteBusinessAsset(assetId: string) {
  const supabase = createAdminClient()

  // Get asset to delete file from storage
  const { data: asset } = await supabase
    .from('business_assets')
    .select('file_path')
    .eq('id', assetId)
    .single()

  if (asset?.file_path) {
    // Delete from storage
    await supabase.storage
      .from('job-assets')
      .remove([asset.file_path])
  }

  // Delete record
  const { error } = await supabase
    .from('business_assets')
    .delete()
    .eq('id', assetId)

  if (error) throw error
}
