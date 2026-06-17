'use client'

import { useState, useEffect } from 'react'
import type { BusinessFact, BusinessAsset, BusinessFactType } from '@/types/business'

const FACT_TYPES: { value: BusinessFactType; label: string }[] = [
  { value: 'result', label: 'Client Result' },
  { value: 'credential', label: 'Credential' },
  { value: 'product_spec', label: 'Product/Service Spec' },
  { value: 'location', label: 'Location' },
  { value: 'persona_note', label: 'Persona Note' },
  { value: 'other', label: 'Other' }
]

export default function BusinessFactsManager() {
  const [facts, setFacts] = useState<BusinessFact[]>([])
  const [assets, setAssets] = useState<BusinessAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddFact, setShowAddFact] = useState(false)
  const [newFact, setNewFact] = useState({
    type: 'result' as BusinessFactType,
    content: '',
    serviceTag: ''
  })
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)
  const [reviewingAsset, setReviewingAsset] = useState<BusinessAsset | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [factsRes, assetsRes] = await Promise.all([
        fetch('/api/business-facts'),
        fetch('/api/business-assets')
      ])
      const factsData = await factsRes.json()
      const assetsData = await assetsRes.json()
      setFacts(factsData)
      setAssets(assetsData)
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  async function addFact() {
    try {
      const res = await fetch('/api/business-facts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newFact)
      })
      if (!res.ok) throw new Error('Failed to create fact')
      await loadData()
      setShowAddFact(false)
      setNewFact({ type: 'result', content: '', serviceTag: '' })
    } catch (error) {
      console.error('Failed to add fact:', error)
      alert('Failed to add fact')
    }
  }

  async function deleteFact(id: string) {
    if (!confirm('Delete this fact? Any linked assets will become standalone.')) return
    try {
      const res = await fetch(`/api/business-facts/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      await loadData()
    } catch (error) {
      console.error('Failed to delete fact:', error)
      alert('Failed to delete fact')
    }
  }

  async function uploadAsset(factId: string, file: File) {
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('businessFactId', factId)

      const res = await fetch('/api/business-assets', {
        method: 'POST',
        body: formData
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Upload failed')
      }

      const asset = await res.json()

      // If auto-rejected due to PII, show alert
      if (asset.status === 'rejected') {
        alert(`Upload blocked: ${asset.rejection_reason}`)
      }

      await loadData()
      setUploadingFor(null)
    } catch (error) {
      console.error('Failed to upload asset:', error)
      alert(error instanceof Error ? error.message : 'Upload failed')
    }
  }

  async function reviewAsset(assetId: string, action: 'approve' | 'reject', reason?: string) {
    try {
      const res = await fetch(`/api/business-assets/${assetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason })
      })
      if (!res.ok) throw new Error('Failed to update asset')
      await loadData()
      setReviewingAsset(null)
    } catch (error) {
      console.error('Failed to review asset:', error)
      alert('Failed to update asset')
    }
  }

  async function deleteAsset(id: string) {
    if (!confirm('Delete this asset permanently?')) return
    try {
      const res = await fetch(`/api/business-assets/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      await loadData()
    } catch (error) {
      console.error('Failed to delete asset:', error)
      alert('Failed to delete asset')
    }
  }

  function getAssetUrl(asset: BusinessAsset): string {
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    return `${baseUrl}/storage/v1/object/public/job-assets/${asset.file_path}`
  }

  if (loading) return <div className="p-4">Loading...</div>

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Business Facts & Assets</h2>
        <button
          onClick={() => setShowAddFact(true)}
          className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700"
        >
          Add Fact
        </button>
      </div>

      {showAddFact && (
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
          <h3 className="font-semibold mb-3">New Business Fact</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <select
                value={newFact.type}
                onChange={e => setNewFact({ ...newFact, type: e.target.value as BusinessFactType })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              >
                {FACT_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Content</label>
              <textarea
                value={newFact.content}
                onChange={e => setNewFact({ ...newFact, content: e.target.value })}
                placeholder="e.g., Increased credit score by 150 points in 90 days"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[80px]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Service Tag (optional)
              </label>
              <input
                type="text"
                value={newFact.serviceTag}
                onChange={e => setNewFact({ ...newFact, serviceTag: e.target.value })}
                placeholder="e.g., credit_repair, business_funding"
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={addFact}
                disabled={!newFact.content}
                className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setShowAddFact(false)
                  setNewFact({ type: 'result', content: '', serviceTag: '' })
                }}
                className="bg-gray-200 px-4 py-2 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {facts.map(fact => {
          const factAssets = assets.filter(a => a.business_fact_id === fact.id)
          const pendingAssets = factAssets.filter(a => a.status === 'pending_review')

          return (
            <div key={fact.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                      {FACT_TYPES.find(t => t.value === fact.type)?.label}
                    </span>
                    {fact.service_tag && (
                      <span className="text-xs bg-blue-100 px-2 py-1 rounded">
                        {fact.service_tag}
                      </span>
                    )}
                  </div>
                  <p className="text-sm">{fact.content}</p>
                </div>
                <button
                  onClick={() => deleteFact(fact.id)}
                  className="text-red-600 hover:text-red-800 text-sm"
                >
                  Delete
                </button>
              </div>

              {/* Assets for this fact */}
              <div className="mt-3 space-y-2">
                {factAssets.map(asset => (
                  <div key={asset.id} className="flex items-center gap-3 bg-gray-50 p-2 rounded">
                    <img
                      src={getAssetUrl(asset)}
                      alt="Asset"
                      className="w-16 h-16 object-cover rounded"
                    />
                    <div className="flex-1 text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded ${
                          asset.status === 'approved' ? 'bg-green-100 text-green-800' :
                          asset.status === 'rejected' ? 'bg-red-100 text-red-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {asset.status}
                        </span>
                        {asset.status === 'pending_review' && (
                          <button
                            onClick={() => setReviewingAsset(asset)}
                            className="text-blue-600 hover:underline text-xs"
                          >
                            Review
                          </button>
                        )}
                      </div>
                      {asset.rejection_reason && (
                        <p className="text-red-600 text-xs mt-1">{asset.rejection_reason}</p>
                      )}
                    </div>
                    <button
                      onClick={() => deleteAsset(asset.id)}
                      className="text-red-600 hover:text-red-800 text-xs"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>

              {/* Upload button */}
              {uploadingFor === fact.id ? (
                <div className="mt-3">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) uploadAsset(fact.id, file)
                    }}
                    className="text-sm"
                  />
                  <button
                    onClick={() => setUploadingFor(null)}
                    className="ml-2 text-sm text-gray-600 hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setUploadingFor(fact.id)}
                  className="mt-3 text-sm text-blue-600 hover:underline"
                >
                  + Add Screenshot
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Review Modal */}
      {reviewingAsset && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6">
            <h3 className="text-xl font-bold mb-4">Review Asset</h3>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <h4 className="font-semibold mb-2">Fact Content</h4>
                <p className="text-sm bg-gray-50 p-3 rounded">
                  {facts.find(f => f.id === reviewingAsset.business_fact_id)?.content}
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Screenshot</h4>
                <img
                  src={getAssetUrl(reviewingAsset)}
                  alt="Asset preview"
                  className="w-full rounded border"
                />
              </div>
            </div>

            {reviewingAsset.pii_check_result?.has_pii && (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-4">
                <p className="text-sm text-yellow-800">
                  ⚠️ PII detected: {reviewingAsset.pii_check_result.pii_types?.join(', ')}
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => reviewAsset(reviewingAsset.id, 'approve')}
                className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
              >
                Approve
              </button>
              <button
                onClick={() => {
                  const reason = prompt('Rejection reason:')
                  if (reason) reviewAsset(reviewingAsset.id, 'reject', reason)
                }}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
              >
                Reject
              </button>
              <button
                onClick={() => setReviewingAsset(null)}
                className="bg-gray-200 px-4 py-2 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
