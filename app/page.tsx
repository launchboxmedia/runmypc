'use client'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { StylePicker } from '@/components/StylePicker'
import type { StyleId } from '@/lib/designSystem/styleLibrary'

type BusinessAsset = {
  id: string
  asset_type: string | null
  file_path: string
  usable_in: string
}

export default function Home() {
  const [topic, setTopic] = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [outcome, setOutcome] = useState('')
  const [mode, setMode] = useState<'full_run' | 'ebook_only' | 'content_only' | 'ads_only'>('full_run')
  const [flipbookproUrl, setFlipbookproUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [approvedAssets, setApprovedAssets] = useState<BusinessAsset[]>([])
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([])
  const [assetSignedUrls, setAssetSignedUrls] = useState<Record<string, string>>({})
  const [overrideStyle, setOverrideStyle] = useState<StyleId | null>(null)
  const [overrideColor, setOverrideColor] = useState<string>('')
  const [overrideSplit, setOverrideSplit] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  useEffect(() => {
    const topicParam = searchParams.get('topic')
    const audienceParam = searchParams.get('audience')
    const outcomeParam = searchParams.get('outcome')

    if (topicParam) setTopic(topicParam)
    if (audienceParam) setTargetAudience(audienceParam)
    if (outcomeParam) setOutcome(outcomeParam)
  }, [searchParams])

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('audience_description, audience_outcome')
        .eq('id', user.id)
        .single()

      if (profile) {
        if (!targetAudience && profile.audience_description) setTargetAudience(profile.audience_description)
        if (!outcome && profile.audience_outcome) setOutcome(profile.audience_outcome)
      }

      // Load approved assets
      const { data: assets } = await supabase
        .from('business_assets')
        .select('id, asset_type, file_path, usable_in')
        .eq('user_id', user.id)
        .eq('status', 'approved')

      if (assets) {
        setApprovedAssets(assets)

        // Generate signed URLs for thumbnails
        const urls: Record<string, string> = {}
        for (const asset of assets) {
          const { data: signedData } = await supabase.storage
            .from('job-assets')
            .createSignedUrl(asset.file_path, 3600)
          if (signedData?.signedUrl) urls[asset.id] = signedData.signedUrl
        }
        setAssetSignedUrls(urls)
      }
    }
    loadProfile()
  }, [])

  async function handleSubmit() {
    if (!topic.trim() || !targetAudience.trim() || !outcome.trim()) return
    setLoading(true)
    setError('')

    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic,
        target_audience: targetAudience,
        outcome,
        mode,
        flipbookpro_url: flipbookproUrl || null,
        selected_asset_ids: selectedAssetIds,
        style_id: overrideStyle ?? undefined,
        primary_color: overrideColor || undefined,
        split_image_cover: overrideSplit || undefined
      })
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'Failed to start job')
      setLoading(false)
      return
    }

    router.push(`/jobs/${data.jobId}`)
  }

  function toggleAsset(assetId: string) {
    setSelectedAssetIds(prev =>
      prev.includes(assetId)
        ? prev.filter(id => id !== assetId)
        : [...prev, assetId]
    )
  }

  return (
    <main className="min-h-screen bg-black text-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-10 bg-black border-b border-gray-900 px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="border-t-2 border-b-2 border-[#E8622A] px-3 py-1">
            <span className="text-sm font-black tracking-widest">RUN MY PC</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="/history" className="text-gray-500 hover:text-white text-sm">History</a>
            <a href="/profile" className="text-gray-500 hover:text-white text-sm">Profile</a>
            <a href="/billing" className="text-gray-500 hover:text-white text-sm">Billing</a>
          </div>
        </div>
      </nav>

      <div className="flex flex-col items-center justify-center min-h-screen p-8 pt-24">
        <div className="w-full max-w-xl">

        {/* Logo */}
        <div className="mb-12 text-center">
          <div className="inline-block border-t-4 border-b-4 border-[#E8622A] px-8 py-4">
            <h1 className="text-6xl font-black tracking-tight leading-none">RUN</h1>
            <h1 className="text-6xl font-black tracking-tight leading-none">MY PC</h1>
          </div>
        </div>

        {/* Topic Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-400 mb-2 uppercase tracking-widest">
            What's your topic or book about?
          </label>
          <textarea
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="e.g. Zero Excuses — how to fund a business with no revenue history"
            rows={3}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-4 text-white placeholder-gray-600 focus:outline-none focus:border-[#E8622A] resize-none"
          />
        </div>

        {/* Target Audience Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-400 mb-2 uppercase tracking-widest">
            Who are you trying to reach?
          </label>
          <textarea
            value={targetAudience}
            onChange={e => setTargetAudience(e.target.value)}
            placeholder="e.g. New entrepreneurs who need startup capital but have no credit history"
            rows={2}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-4 text-white placeholder-gray-600 focus:outline-none focus:border-[#E8622A] resize-none"
          />
        </div>

        {/* Outcome Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-400 mb-2 uppercase tracking-widest">
            In one sentence — what will they learn or be able to do?
          </label>
          <textarea
            value={outcome}
            onChange={e => setOutcome(e.target.value)}
            placeholder="e.g. How to use 0% business credit cards to fund a startup from scratch"
            rows={2}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-4 text-white placeholder-gray-600 focus:outline-none focus:border-[#E8622A] resize-none"
          />
        </div>

        {/* Asset Selection */}
        {approvedAssets.length > 0 && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-400 mb-3 uppercase tracking-widest">
              Select Assets for This Run (Optional)
            </label>
            <div className="grid grid-cols-3 gap-3">
              {approvedAssets.map(asset => (
                <button
                  key={asset.id}
                  onClick={() => toggleAsset(asset.id)}
                  className={`relative aspect-square rounded-lg border-2 overflow-hidden transition-all ${
                    selectedAssetIds.includes(asset.id)
                      ? 'border-[#E8622A] ring-2 ring-[#E8622A]/50'
                      : 'border-gray-700 hover:border-gray-500'
                  }`}
                >
                  {assetSignedUrls[asset.id] && (
                    <img
                      src={assetSignedUrls[asset.id]}
                      alt={asset.asset_type || 'asset'}
                      className="w-full h-full object-cover"
                    />
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/80 p-2">
                    <p className="text-xs text-gray-400 truncate">
                      {asset.asset_type || 'asset'}
                    </p>
                    <p className="text-xs text-gray-600">
                      {asset.usable_in}
                    </p>
                  </div>
                  {selectedAssetIds.includes(asset.id) && (
                    <div className="absolute top-2 right-2 w-6 h-6 bg-[#E8622A] rounded-full flex items-center justify-center text-white text-xs font-bold">
                      ✓
                    </div>
                  )}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-600 mt-2">
              {selectedAssetIds.length} asset{selectedAssetIds.length !== 1 ? 's' : ''} selected
            </p>
          </div>
        )}

        {/* Mode Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-400 mb-3 uppercase tracking-widest">
            What do you want to create?
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setMode('full_run')}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                mode === 'full_run'
                  ? 'border-[#E8622A] bg-[#E8622A]/10'
                  : 'border-gray-700 hover:border-gray-500'
              }`}
            >
              <div className="font-bold mb-1">Full Run</div>
              <div className="text-sm text-gray-400">Ebook + content + ads</div>
            </button>
            <button
              onClick={() => setMode('ebook_only')}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                mode === 'ebook_only'
                  ? 'border-[#E8622A] bg-[#E8622A]/10'
                  : 'border-gray-700 hover:border-gray-500'
              }`}
            >
              <div className="font-bold mb-1">Ebook Only</div>
              <div className="text-sm text-gray-400">Just the FlipBookPro pipeline</div>
            </button>
            <button
              onClick={() => setMode('content_only')}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                mode === 'content_only'
                  ? 'border-[#E8622A] bg-[#E8622A]/10'
                  : 'border-gray-700 hover:border-gray-500'
              }`}
            >
              <div className="font-bold mb-1">Content Only</div>
              <div className="text-sm text-gray-400">Social posts + creatives</div>
            </button>
            <button
              onClick={() => setMode('ads_only')}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                mode === 'ads_only'
                  ? 'border-[#E8622A] bg-[#E8622A]/10'
                  : 'border-gray-700 hover:border-gray-500'
              }`}
            >
              <div className="font-bold mb-1">Ads Only</div>
              <div className="text-sm text-gray-400">Ad copy for all platforms</div>
            </button>
          </div>
        </div>

        {/* Optional FlipBookPro URL */}
        {(mode === 'content_only' || mode === 'ads_only') && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-400 mb-2 uppercase tracking-widest">
              Existing Ebook (Optional)
            </label>
            <input
              type="url"
              value={flipbookproUrl}
              onChange={e => setFlipbookproUrl(e.target.value)}
              placeholder="Have an existing ebook? Paste the URL (optional)"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-4 text-white placeholder-gray-600 focus:outline-none focus:border-[#E8622A]"
            />
          </div>
        )}

        {/* Optional per-job design override */}
        <details className="mb-6 rounded-lg border border-gray-700 p-4">
          <summary className="cursor-pointer text-sm font-medium text-gray-400 uppercase tracking-widest">
            Override design for this job (optional)
          </summary>
          <div className="mt-4 space-y-4">
            <StylePicker value={overrideStyle} onChange={setOverrideStyle} />
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={overrideColor || '#111827'}
                onChange={e => setOverrideColor(e.target.value)}
                className="h-11 w-14 rounded-lg border border-gray-700 bg-gray-900 p-1 cursor-pointer"
              />
              <input
                value={overrideColor}
                onChange={e => setOverrideColor(e.target.value)}
                placeholder="#2563EB (optional)"
                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg p-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#E8622A]"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={overrideSplit} onChange={e => setOverrideSplit(e.target.checked)} />
              Split-image cover for this job
            </label>
          </div>
        </details>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading || !topic.trim() || !targetAudience.trim() || !outcome.trim()}
          className="w-full py-4 bg-[#E8622A] hover:bg-[#d4551f] disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-lg rounded-lg transition-all uppercase tracking-widest"
        >
          {loading ? 'Starting...' : 'Run It'}
        </button>

        </div>
      </div>
    </main>
  )
}
