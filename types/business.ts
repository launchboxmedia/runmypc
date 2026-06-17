export type BusinessFactType = 'result' | 'credential' | 'product_spec' | 'location' | 'persona_note' | 'other'

export type AssetStatus = 'pending_review' | 'approved' | 'rejected'

export interface BusinessFact {
  id: string
  user_id: string
  type: BusinessFactType
  content: string
  service_tag?: string
  created_at: string
  updated_at: string
}

export interface BusinessAsset {
  id: string
  user_id: string
  business_fact_id?: string
  file_path: string
  file_type: string
  status: AssetStatus
  pii_check_result?: {
    has_pii: boolean
    pii_types?: string[]
    confidence?: number
  }
  rejection_reason?: string
  created_at: string
  updated_at: string
}
