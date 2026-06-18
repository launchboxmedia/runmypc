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

  // Get primary topic from metadata (new schema) or fallback to old winning_angle
  const primaryTopic = researchOutput.metadata?.primary_topic || data.winning_angle || ''
  const { top_3_angles, what_is_working, search_trends, top_performers, platforms_analyzed } = data

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
                  Research Complete — Primary topic selected
                </p>
                <p className="text-xs text-[#E8622A] mt-1 font-medium">
                  "{primaryTopic || 'Analyzing...'}"
                </p>
                {platforms_analyzed && (
                  <p className="text-xs text-gray-500 mt-1">
                    Instagram ({platforms_analyzed.instagram || 0}) · TikTok ({platforms_analyzed.tiktok || 0}) · YouTube ({platforms_analyzed.youtube || 0}) · LinkedIn ({platforms_analyzed.linkedin || 0}) · ↓ expand
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

      {/* Primary Topic */}
      <div className="mb-6 p-4 bg-gradient-to-r from-[#E8622A]/20 to-transparent border-l-4 border-[#E8622A] rounded">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
          PRIMARY TOPIC
        </p>
        <p className="text-lg text-white font-bold mb-1">
          "{primaryTopic}"
        </p>
        {data.topic_rationale && (
          <p className="text-sm text-gray-400 mt-2">
            {data.topic_rationale}
          </p>
        )}
      </div>

      {/* Top Topics */}
      {data.topics && data.topics.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
            TOPICS CONSIDERED
          </p>
          <div className="space-y-2">
            {data.topics.map((topic: any, i: number) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <span className="text-gray-500 font-mono">{i + 1}.</span>
                <div className="flex-1">
                  <span className="text-gray-300">{topic.title || topic.angle}</span>
                  {topic.source && <span className="text-gray-500 text-xs ml-2">({topic.source})</span>}
                  {i === 0 && <span className="text-green-400 ml-2">✓ selected</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* What's Working */}
      {what_is_working && what_is_working.length > 0 && (
        <div className="mb-6 p-4 bg-gray-900 rounded-lg">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
            WHAT'S WORKING IN THIS NICHE
          </p>
          <div className="space-y-1">
            {what_is_working.map((pattern: string, i: number) => (
              <p key={i} className="text-sm text-gray-300">• {pattern}</p>
            ))}
          </div>
        </div>
      )}

      {/* Search Trends */}
      {search_trends && search_trends.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
            TRENDING SEARCHES
          </p>
          <div className="flex flex-wrap gap-2">
            {search_trends.map((trend: string, i: number) => (
              <span key={i} className="text-xs px-3 py-1 bg-gray-900 text-gray-400 rounded-full">
                "{trend}"
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Top Performers */}
      {top_performers && (
        <div className="space-y-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
            TOP PERFORMERS
          </p>

          {top_performers.instagram && (
            <div>
              <p className="text-xs font-bold text-[#E8622A] uppercase tracking-widest mb-1">
                📱 Instagram
              </p>
              <p className="text-sm text-white mb-1">
                "{top_performers.instagram.caption?.substring(0, 100)}{top_performers.instagram.caption?.length > 100 ? '...' : ''}"
              </p>
              <p className="text-xs text-gray-400">
                {formatNumber(top_performers.instagram.likes)} likes · {formatNumber(top_performers.instagram.comments)} comments
              </p>
            </div>
          )}

          {top_performers.tiktok && (
            <div>
              <p className="text-xs font-bold text-[#E8622A] uppercase tracking-widest mb-1">
                🎵 TikTok
              </p>
              <p className="text-sm text-white mb-1">
                "{top_performers.tiktok.text?.substring(0, 100)}{top_performers.tiktok.text?.length > 100 ? '...' : ''}"
              </p>
              <p className="text-xs text-gray-400">
                {formatNumber(top_performers.tiktok.views)} views · {formatNumber(top_performers.tiktok.likes)} likes
              </p>
            </div>
          )}

          {top_performers.youtube && (
            <div>
              <p className="text-xs font-bold text-[#E8622A] uppercase tracking-widest mb-1">
                ▶ YouTube
              </p>
              <p className="text-sm text-white mb-1">
                "{top_performers.youtube.title?.substring(0, 100)}{top_performers.youtube.title?.length > 100 ? '...' : ''}"
              </p>
              <p className="text-xs text-gray-400">
                {formatNumber(top_performers.youtube.views)} views
              </p>
            </div>
          )}

          {top_performers.linkedin && (
            <div>
              <p className="text-xs font-bold text-[#E8622A] uppercase tracking-widest mb-1">
                💼 LinkedIn
              </p>
              <p className="text-sm text-white mb-1">
                "{top_performers.linkedin.text?.substring(0, 100)}{top_performers.linkedin.text?.length > 100 ? '...' : ''}"
              </p>
              <p className="text-xs text-gray-400">
                {formatNumber(top_performers.linkedin.likes)} likes · {formatNumber(top_performers.linkedin.comments)} comments
              </p>
            </div>
          )}
        </div>
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
