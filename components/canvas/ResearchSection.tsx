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

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toString()
}

export function ResearchSection({ outputs, isActive }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (!isActive) return null

  const researchOutput = outputs.find(o => o.output_type === 'niche_research')

  if (!researchOutput) {
    return (
      <div className="mb-8 p-4 bg-gray-950 border border-gray-800 rounded-lg">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#E8622A] animate-pulse"/>
          <p className="text-sm text-gray-400">
            Agent is researching your niche across Instagram, TikTok, YouTube and LinkedIn...
          </p>
        </div>
      </div>
    )
  }

  let data: any = {}
  try {
    data = JSON.parse(researchOutput.content || '{}')
  } catch {}

  const { instagram, tiktok, youtube, linkedin, synthesis } = data
  const searchTerms = researchOutput.metadata?.search_terms || ''

  if (!expanded) {
    return (
      <div className="mb-8">
        <button
          onClick={() => setExpanded(true)}
          className="w-full p-4 bg-gray-950 border border-gray-800 rounded-lg hover:border-gray-700 transition-all text-left"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-green-400 text-sm">✓</span>
              <div>
                <p className="text-sm text-gray-300">
                  Research Complete — Instagram ({instagram?.count || 0}) · TikTok ({tiktok?.count || 0}) · YouTube ({youtube?.count || 0}) · LinkedIn ({linkedin?.count || 0})
                </p>
                {searchTerms && (
                  <p className="text-xs text-gray-500 mt-1">
                    Searched: {searchTerms}
                  </p>
                )}
              </div>
            </div>
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>
      </div>
    )
  }

  return (
    <div className="mb-8 p-6 bg-gray-950 border border-gray-800 rounded-lg">
      {searchTerms && (
        <div className="mb-4 pb-4 border-b border-gray-800">
          <p className="text-xs text-gray-500">
            Search terms used: {searchTerms.split(', ').map((term: string, i: number) => (
              <span key={i}>
                {i > 0 && ' · '}
                <span className="text-gray-400">{term}</span>
              </span>
            ))}
          </p>
        </div>
      )}
      <div className="space-y-4 mb-6">
        {instagram?.top_performer && (
          <div>
            <p className="text-xs font-bold text-[#E8622A] uppercase tracking-widest mb-2">
              📱 Instagram — {instagram.count} posts analyzed
            </p>
            <p className="text-sm text-white mb-1">
              Top: "{instagram.top_performer.caption?.substring(0, 80)}{instagram.top_performer.caption?.length > 80 ? '...' : ''}"
            </p>
            <p className="text-xs text-gray-400">
              {formatNumber(instagram.top_performer.likes)} likes · {formatNumber(instagram.top_performer.comments)} comments
            </p>
          </div>
        )}

        {tiktok?.top_performer && (
          <div>
            <p className="text-xs font-bold text-[#E8622A] uppercase tracking-widest mb-2">
              🎵 TikTok — {tiktok.count} videos analyzed
            </p>
            <p className="text-sm text-white mb-1">
              Top: "{tiktok.top_performer.text?.substring(0, 80)}{tiktok.top_performer.text?.length > 80 ? '...' : ''}"
            </p>
            <p className="text-xs text-gray-400">
              {formatNumber(tiktok.top_performer.views)} views · {formatNumber(tiktok.top_performer.likes)} likes · {formatNumber(tiktok.top_performer.shares)} shares
            </p>
          </div>
        )}

        {youtube?.top_performer && (
          <div>
            <p className="text-xs font-bold text-[#E8622A] uppercase tracking-widest mb-2">
              ▶ YouTube — {youtube.count} videos analyzed
            </p>
            <p className="text-sm text-white mb-1">
              Top: "{youtube.top_performer.title?.substring(0, 80)}{youtube.top_performer.title?.length > 80 ? '...' : ''}"
            </p>
            <p className="text-xs text-gray-400">
              {formatNumber(youtube.top_performer.views)} views · {formatNumber(youtube.top_performer.likes)} likes
            </p>
          </div>
        )}

        {linkedin?.top_performer && (
          <div>
            <p className="text-xs font-bold text-[#E8622A] uppercase tracking-widest mb-2">
              💼 LinkedIn — {linkedin.count} posts analyzed
            </p>
            <p className="text-sm text-white mb-1">
              Top: "{linkedin.top_performer.text?.substring(0, 80)}{linkedin.top_performer.text?.length > 80 ? '...' : ''}"
            </p>
            <p className="text-xs text-gray-400">
              {formatNumber(linkedin.top_performer.likes)} likes · {formatNumber(linkedin.top_performer.comments)} comments · {formatNumber(linkedin.top_performer.reposts)} reposts
            </p>
          </div>
        )}
      </div>

      {synthesis && (
        <>
          <div className="border-t border-gray-800 my-4"/>
          <div className="p-4 bg-gray-900 rounded-lg">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
              What's Working In This Niche
            </p>
            <div className="text-sm text-gray-300 space-y-2">
              {synthesis.split('\n').filter((line: string) => line.trim()).map((line: string, i: number) => (
                <p key={i}>• {line.replace(/^[-•*]\s*/, '')}</p>
              ))}
            </div>
          </div>
        </>
      )}

      <button
        onClick={() => setExpanded(false)}
        className="mt-4 text-xs text-gray-500 hover:text-gray-400"
      >
        Collapse ↑
      </button>
    </div>
  )
}
