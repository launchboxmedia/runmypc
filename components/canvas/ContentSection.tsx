'use client'
import { useState } from 'react'
import { ResearchSection } from './ResearchSection'

type JobOutput = {
  id: string
  job_id: string
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
  isRefined?: boolean
}

const PLATFORMS = ['instagram', 'tiktok', 'youtube', 'linkedin']

export function ContentSection({ outputs, isActive, isRefined }: Props) {
  const [activeTab, setActiveTab] = useState('instagram')

  if (!isActive) return null

  const creatives = outputs.filter(o => o.output_type === 'static_creative' && o.platform !== 'instagram_carousel')
  const carousel = outputs.find(o => o.output_type === 'static_creative' && o.platform === 'instagram_carousel')
  const cinematicVideo = outputs.find(o => o.output_type === 'cinematic_video')
  const videos = outputs.filter(o => o.output_type === 'social_video' || o.output_type === 'platform_video')
  const socialPosts = outputs.filter(o =>
    o.output_type === 'ad_copy' && o.metadata?.type === 'social_post'
  )
  const platformPosts = socialPosts.filter(p => p.platform === activeTab)

  return (
    <div className="mb-16">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-full bg-[#E8622A] flex items-center justify-center text-white font-black text-sm">
          2
        </div>
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">
          Content Agent
          {isRefined && (
            <span className="text-[#E8622A] ml-2 normal-case">— Refined ✓</span>
          )}
        </h2>
      </div>

      <ResearchSection outputs={outputs} isActive={isActive} />

      {/* Hero Video */}
      {cinematicVideo && (
        <div className="mb-8">
          <p className="text-xs text-gray-600 uppercase tracking-widest mb-3">Hero Video</p>
          <div className="relative rounded-lg overflow-hidden border border-gray-800" style={{ maxWidth: 240 }}>
            <video
              src={cinematicVideo.url || ''}
              className="w-full"
              controls
              muted
              playsInline
              autoPlay
              loop
            />
            <div className="p-3 flex items-center justify-between bg-gray-900">
              <p className="text-xs text-gray-400">Cinematic Hero</p>
              {cinematicVideo.url && (
                <a href={cinematicVideo.url} download className="text-xs text-[#E8622A] hover:underline">
                  Download
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Instagram Carousel */}
      {carousel && carousel.metadata?.slide_urls && (
        <div className="mb-8">
          <p className="text-xs text-gray-600 uppercase tracking-widest mb-3">
            Instagram Carousel — {carousel.metadata.slide_count} Slides
          </p>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {carousel.metadata.slide_urls.map((url: string, i: number) => (
              <div key={i} className="shrink-0">
                <img
                  src={url}
                  alt={`Slide ${i + 1}`}
                  className="w-24 h-24 object-cover rounded-lg border border-gray-800"
                />
                <p className="text-xs text-gray-600 text-center mt-1">
                  {i === 0 ? 'Hook' : i === carousel.metadata.slide_count - 1 ? 'CTA' : `Slide ${i + 1}`}
                </p>
              </div>
            ))}
          </div>
          <a
            href={`/api/jobs/${outputs[0]?.job_id}/download-carousel`}
            className="mt-2 inline-block text-xs text-[#E8622A] hover:underline"
          >
            Download All Slides (ZIP)
          </a>
        </div>
      )}

      {/* Creatives */}
      <div className="mb-8">
        <p className="text-xs text-gray-600 uppercase tracking-widest mb-3">Creatives</p>
        <div className="flex gap-3 flex-wrap">
          {creatives.length === 0 ? (
            [...Array(3)].map((_, i) => (
              <div key={i} className="w-28 h-28 bg-gray-900 rounded-lg animate-pulse border border-gray-800"/>
            ))
          ) : (
            creatives.map(creative => (
              <div key={creative.id} className="relative group w-28 h-28">
                <div className="w-full h-full bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
                  {creative.url && (
                    <img
                      src={creative.url}
                      alt={creative.label}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                {creative.url && (
                  <a
                    href={creative.url}
                    download
                    className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs text-white font-bold rounded-lg"
                  >
                    Download
                  </a>
                )}
                <p className="text-xs text-gray-600 mt-1 text-center truncate">
                  {creative.platform}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Videos */}
      {videos.length > 0 && (
        <div className="mb-8">
          <p className="text-xs text-gray-600 uppercase tracking-widest mb-3">Videos</p>
          <div className="flex gap-3 flex-wrap">
            {videos.map(video => (
              <div key={video.id} className="relative group">
                <div className="w-40 h-72 bg-gray-900 rounded-lg border border-gray-800 overflow-hidden flex items-center justify-center">
                  <video
                    src={video.url || ''}
                    className="w-full h-full object-cover"
                    controls
                    muted
                    playsInline
                  />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-xs text-gray-600 capitalize">{video.platform}</p>
                  {video.url && (
                    <a
                      href={video.url}
                      download
                      className="text-xs text-[#E8622A] hover:underline"
                    >
                      Download
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Social Copy */}
      <div>
        <p className="text-xs text-gray-600 uppercase tracking-widest mb-3">Social Copy</p>
        <div className="flex gap-1 mb-4 border-b border-gray-800 overflow-x-auto">
          {PLATFORMS.map(platform => (
            <button
              key={platform}
              onClick={() => setActiveTab(platform)}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-widest whitespace-nowrap transition-all ${
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
          {platformPosts.length === 0 ? (
            <div className="h-32 bg-gray-900 rounded-lg border border-gray-800 animate-pulse"/>
          ) : (
            platformPosts.map(post => {
              let parsed: any = {}
              try { parsed = JSON.parse(post.content || '{}') } catch {}
              return (
                <div key={post.id} className={`p-4 bg-gray-900 rounded-lg border ${
                  post.metadata?.refined ? 'border-[#E8622A]' : 'border-gray-800'
                }`}>
                  {post.metadata?.refined && (
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs text-[#E8622A] font-bold">
                        ✓ Refined — Score {post.metadata.score}/10
                      </span>
                    </div>
                  )}
                  {parsed.hook && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-600 uppercase tracking-widest mb-1">Hook</p>
                      <p className="text-sm text-white font-medium">{parsed.hook}</p>
                    </div>
                  )}
                  {parsed.body && (
                    <div className="mb-3">
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
                  {parsed.hashtags?.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-600 uppercase tracking-widest mb-1">Hashtags</p>
                      <p className="text-sm text-gray-500">{parsed.hashtags.join(' ')}</p>
                    </div>
                  )}
                  <button
                    onClick={() => navigator.clipboard.writeText(
                      [parsed.hook, parsed.body, parsed.cta, parsed.hashtags?.join(' ')]
                        .filter(Boolean).join('\n\n')
                    )}
                    className="text-xs text-[#E8622A] hover:underline"
                  >
                    Copy post
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
