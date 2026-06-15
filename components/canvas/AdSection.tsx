'use client'
import { useState } from 'react'

type JobOutput = {
  id: string
  output_type: string
  platform: string | null
  label: string
  url: string | null
  content: string | null
  metadata: any
}

type Props = {
  outputs: JobOutput[]
  isActive: boolean
}

const AD_PLATFORMS = ['facebook', 'tiktok', 'google', 'x']

export function AdSection({ outputs, isActive }: Props) {
  const [activeTab, setActiveTab] = useState('facebook')

  if (!isActive) return null

  const adCopy = outputs.filter(o =>
    o.output_type === 'ad_copy' && o.metadata?.type === 'ad_copy'
  )
  const platformAds = adCopy.filter(a => a.platform === activeTab)

  return (
    <div className="mb-16">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-full bg-[#E8622A] flex items-center justify-center text-white font-black text-sm">
          3
        </div>
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Ad Agent</h2>
      </div>

      <div className="flex gap-1 mb-4 border-b border-gray-800">
        {AD_PLATFORMS.map(platform => (
          <button
            key={platform}
            onClick={() => setActiveTab(platform)}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-widest transition-all ${
              activeTab === platform
                ? 'text-[#E8622A] border-b-2 border-[#E8622A]'
                : 'text-gray-600 hover:text-gray-400'
            }`}
          >
            {platform}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {platformAds.length === 0 ? (
          <div className="h-32 bg-gray-900 rounded-lg border border-gray-800 animate-pulse"/>
        ) : (
          platformAds.map(ad => {
            let parsed: any = {}
            try { parsed = JSON.parse(ad.content || '{}') } catch {}

            const isVariantB = ad.metadata?.loop === 'ad_testing'
            const predictedWinner = ad.metadata?.predicted_winner
            const isWinner = (isVariantB && predictedWinner === 'B') ||
                           (!isVariantB && predictedWinner === 'A')

            return (
              <div key={ad.id} className={`p-4 bg-gray-900 rounded-lg border ${
                isWinner ? 'border-green-700' :
                isVariantB ? 'border-[#E8622A]/40' :
                'border-gray-800'
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                    {parsed.name || ad.label}
                  </span>
                  {isWinner && (
                    <span className="text-xs text-green-400 font-bold">★ Predicted Winner</span>
                  )}
                  {isVariantB && !isWinner && (
                    <span className="text-xs text-gray-600">Variant B</span>
                  )}
                </div>
                {parsed.headline && (
                  <div className="mb-2">
                    <p className="text-xs text-gray-600 uppercase tracking-widest mb-1">Headline</p>
                    <p className="text-sm text-white font-bold">{parsed.headline}</p>
                  </div>
                )}
                {parsed.body && (
                  <div className="mb-2">
                    <p className="text-xs text-gray-600 uppercase tracking-widest mb-1">Body</p>
                    <p className="text-sm text-gray-300">{parsed.body}</p>
                  </div>
                )}
                {parsed.cta && (
                  <div className="mb-3">
                    <p className="text-xs text-gray-600 uppercase tracking-widest mb-1">CTA</p>
                    <p className="text-sm text-gray-300">{parsed.cta}</p>
                  </div>
                )}
                {ad.metadata?.prediction_reason && (
                  <div className="mt-3 p-2 bg-gray-800 rounded">
                    <p className="text-xs text-gray-500">{ad.metadata.prediction_reason}</p>
                  </div>
                )}
                <button
                  onClick={() => navigator.clipboard.writeText(
                    [parsed.headline, parsed.body, parsed.cta].filter(Boolean).join('\n\n')
                  )}
                  className="mt-3 text-xs text-[#E8622A] hover:underline"
                >
                  Copy ad
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
