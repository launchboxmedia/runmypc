'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
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

// v1 social gate — only Instagram + TikTok tabs are shown. YouTube + LinkedIn
// are deferred to v2. Mirrors V1_SOCIAL_PLATFORMS in lib/workflows/content-generation.ts.
const V1_SOCIAL_PLATFORMS = ['instagram', 'tiktok']

export function ContentSection({ outputs, isActive, isRefined }: Props) {
  const [activeTab, setActiveTab] = useState('instagram')
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const [slideSignedUrls, setSlideSignedUrls] = useState<Record<string, string[]>>({})
  // Inline lightbox for carousel slides — stays on the canvas, no new tab/redirect.
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null)

  // Keyboard controls for the lightbox: Esc closes, ←/→ navigate.
  useEffect(() => {
    if (!lightbox) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightbox(null)
      else if (e.key === 'ArrowRight') setLightbox(lb => lb ? { ...lb, index: Math.min(lb.index + 1, lb.urls.length - 1) } : lb)
      else if (e.key === 'ArrowLeft') setLightbox(lb => lb ? { ...lb, index: Math.max(lb.index - 1, 0) } : lb)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

  useEffect(() => {
    async function generateSignedUrls() {
      const supabase = createClient()
      const urls: Record<string, string> = {}
      const slideUrls: Record<string, string[]> = {}

      for (const output of outputs) {
        // Re-sign multi-slide carousels from stored storage paths.
        const slidePaths: string[] | undefined = output.metadata?.slide_paths
        if (slidePaths?.length) {
          const signed: string[] = []
          for (const p of slidePaths) {
            const { data } = await supabase.storage
              .from('job-assets')
              .createSignedUrl(p, 3600) // 1 hour expiry
            if (data?.signedUrl) signed.push(data.signedUrl)
          }
          if (signed.length) slideUrls[output.id] = signed
        }

        // Only generate for outputs with storage_path in metadata
        const storagePath = output.metadata?.storage_path
        if (!storagePath) continue

        const { data } = await supabase.storage
          .from('job-assets')
          .createSignedUrl(storagePath, 3600) // 1 hour expiry

        if (data?.signedUrl) {
          urls[output.id] = data.signedUrl
        }
      }

      setSignedUrls(urls)
      setSlideSignedUrls(slideUrls)
    }

    if (isActive) {
      generateSignedUrls()
    }
  }, [outputs, isActive])

  if (!isActive) return null

  const creatives = outputs.filter(o => o.output_type === 'static_creative' && o.platform !== 'instagram_carousel')
  const carousel = outputs.find(o => o.output_type === 'static_creative' && o.platform === 'instagram_carousel')
  const cinematicVideo = outputs.find(o => o.output_type === 'cinematic_video')
  const videos = outputs.filter(o => o.output_type === 'social_video' || o.output_type === 'platform_video')
  const socialPosts = outputs.filter(o => o.output_type === 'social_post')
  const platformPosts = socialPosts.filter(p => p.platform === activeTab)

  // Helper to get URL: prefer signed URL, fall back to stored URL
  const getOutputUrl = (output: JobOutput) => signedUrls[output.id] || output.url

  // Helper to render research grounding tag
  const getResearchTag = (output: JobOutput) => {
    const grounding = output.metadata?.research_grounding
    if (!grounding) return null

    // Prefer topic_used as it's most human-readable
    if (grounding.topic_used) {
      return `Based on: ${grounding.topic_used}`
    }

    return null
  }

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
              src={getOutputUrl(cinematicVideo) || ''}
              className="w-full"
              controls
              muted
              playsInline
              autoPlay
              loop
            />
            <div className="p-3 bg-gray-900">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-gray-400">Cinematic Hero</p>
                {getOutputUrl(cinematicVideo) && (
                  <a href={getOutputUrl(cinematicVideo) || undefined} download className="text-xs text-[#E8622A] hover:underline">
                    Download
                  </a>
                )}
              </div>
              {getResearchTag(cinematicVideo) && (
                <p className="text-xs text-gray-600 italic">{getResearchTag(cinematicVideo)}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Instagram Carousel — horizontal gallery; click any slide to open the
          inline lightbox (no redirect, no new tab). */}
      {carousel && (() => {
        const slideUrls: string[] = slideSignedUrls[carousel.id] || carousel.metadata?.slide_urls || []
        if (slideUrls.length === 0) return null
        return (
          <div className="mb-8">
            <p className="text-xs text-gray-600 uppercase tracking-widest mb-3">
              Carousel — {slideUrls.length} Slides
            </p>
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
              {slideUrls.map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setLightbox({ urls: slideUrls, index: i })}
                  className="group shrink-0 text-left focus:outline-none"
                  aria-label={`Open slide ${i + 1}`}
                >
                  {/\.mp4(\?|$)/i.test(url) ? (
                    <video
                      src={url}
                      muted
                      playsInline
                      className="w-24 aspect-[4/5] object-cover rounded-lg border border-gray-800 transition-all group-hover:border-[#E8622A] group-hover:brightness-110"
                    />
                  ) : (
                    <img
                      src={url}
                      alt={`Slide ${i + 1}`}
                      loading="lazy"
                      className="w-24 aspect-[4/5] object-cover rounded-lg border border-gray-800 transition-all group-hover:border-[#E8622A] group-hover:brightness-110"
                    />
                  )}
                  <p className="text-xs text-gray-600 text-center mt-1">
                    {i === 0 ? 'Hook' : i === slideUrls.length - 1 ? 'CTA' : `Slide ${i + 1}`}
                  </p>
                </button>
              ))}
            </div>
            <a
              href={`/api/jobs/${outputs[0]?.job_id}/download-carousel`}
              className="mt-2 inline-block text-xs text-[#E8622A] hover:underline"
            >
              Download All Slides (ZIP)
            </a>
          </div>
        )
      })()}

      {/* Creatives — only standalone static creatives (YouTube/LinkedIn/Facebook),
          which are v1-gated off. Instagram/TikTok statics were removed (the carousel
          replaces them). Hidden entirely when there are none, rather than showing
          perpetual loading skeletons. */}
      {creatives.length > 0 && (
      <div className="mb-8">
        <p className="text-xs text-gray-600 uppercase tracking-widest mb-3">Creatives</p>
        <div className="flex gap-3 flex-wrap">
          {(
            creatives.map(creative => {
              const imageUrl = getOutputUrl(creative)
              return (
                <div key={creative.id} className="relative group w-28 h-28">
                  <div className="w-full h-full bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
                    {imageUrl && (
                      <img
                        src={imageUrl}
                        alt={creative.label}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  {imageUrl && (
                    <a
                      href={imageUrl}
                      download
                      className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs text-white font-bold rounded-lg"
                    >
                      Download
                    </a>
                  )}
                  <div className="mt-1">
                    <p className="text-xs text-gray-600 text-center truncate">
                      {creative.platform}
                    </p>
                    {getResearchTag(creative) && (
                      <p className="text-xs text-gray-700 italic text-center truncate mt-0.5">
                        {getResearchTag(creative)}
                      </p>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
      )}

      {/* Videos */}
      {videos.length > 0 && (
        <div className="mb-8">
          <p className="text-xs text-gray-600 uppercase tracking-widest mb-3">Videos</p>
          <div className="flex gap-3 flex-wrap">
            {videos.map(video => {
              const videoUrl = getOutputUrl(video)
              return (
                <div key={video.id} className="relative group">
                  <div className="w-40 h-72 bg-gray-900 rounded-lg border border-gray-800 overflow-hidden flex items-center justify-center">
                    <video
                      src={videoUrl || ''}
                      className="w-full h-full object-cover"
                      controls
                      muted
                      playsInline
                    />
                  </div>
                  <div className="mt-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-600 capitalize">{video.platform}</p>
                      {videoUrl && (
                        <a
                          href={videoUrl}
                          download
                          className="text-xs text-[#E8622A] hover:underline"
                        >
                          Download
                        </a>
                      )}
                    </div>
                    {getResearchTag(video) && (
                      <p className="text-xs text-gray-700 italic mt-0.5">{getResearchTag(video)}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Social Copy */}
      <div>
        <p className="text-xs text-gray-600 uppercase tracking-widest mb-3">Social Copy</p>
        <div className="flex gap-1 mb-4 border-b border-gray-800 overflow-x-auto">
          {V1_SOCIAL_PLATFORMS.map(platform => (
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
              // Prefer persisted structured metadata; fall back to parsed content.
              const data = {
                hook: post.metadata?.hook ?? parsed.hook,
                body: post.metadata?.body ?? parsed.body,
                cta: post.metadata?.cta ?? parsed.cta,
                hashtags: post.metadata?.hashtags ?? parsed.hashtags,
              }
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
                  {data.hook && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-600 uppercase tracking-widest mb-1">Hook</p>
                      <p className="text-sm text-white font-medium">{data.hook}</p>
                    </div>
                  )}
                  {data.body && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-600 uppercase tracking-widest mb-1">Body</p>
                      <p className="text-sm text-gray-300">{data.body}</p>
                    </div>
                  )}
                  {data.cta && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-600 uppercase tracking-widest mb-1">CTA</p>
                      <p className="text-sm text-gray-300">{data.cta}</p>
                    </div>
                  )}
                  {data.hashtags?.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-600 uppercase tracking-widest mb-1">Hashtags</p>
                      <p className="text-sm text-gray-500">{data.hashtags.join(' ')}</p>
                    </div>
                  )}
                  {getResearchTag(post) && (
                    <div className="mt-3 pt-3 border-t border-gray-800">
                      <p className="text-xs text-gray-600 italic">{getResearchTag(post)}</p>
                    </div>
                  )}
                  <button
                    onClick={() => navigator.clipboard.writeText(
                      [data.hook, data.body, data.cta, data.hashtags?.join(' ')]
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

      {/* Inline carousel lightbox — overlays the canvas; click the X or the
          backdrop to close. No redirect, no new tab. */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            aria-label="Close"
            className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-[#E8622A] text-white text-xl font-bold transition-colors"
          >
            ✕
          </button>

          {lightbox.index > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setLightbox(lb => lb ? { ...lb, index: lb.index - 1 } : lb) }}
              aria-label="Previous slide"
              className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-[#E8622A] text-white text-2xl transition-colors"
            >
              ‹
            </button>
          )}

          {/\.mp4(\?|$)/i.test(lightbox.urls[lightbox.index]) ? (
            <video
              src={lightbox.urls[lightbox.index]}
              autoPlay
              loop
              muted
              playsInline
              onClick={(e) => e.stopPropagation()}
              className="max-h-[88vh] max-w-[92vw] w-auto object-contain rounded-xl border border-gray-800 shadow-2xl"
            />
          ) : (
            <img
              src={lightbox.urls[lightbox.index]}
              alt={`Slide ${lightbox.index + 1}`}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[88vh] max-w-[92vw] w-auto object-contain rounded-xl border border-gray-800 shadow-2xl"
            />
          )}

          {lightbox.index < lightbox.urls.length - 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setLightbox(lb => lb ? { ...lb, index: lb.index + 1 } : lb) }}
              aria-label="Next slide"
              className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-[#E8622A] text-white text-2xl transition-colors"
            >
              ›
            </button>
          )}

          <p className="absolute bottom-5 left-1/2 -translate-x-1/2 text-xs text-gray-400 tracking-widest uppercase">
            {lightbox.index + 1} / {lightbox.urls.length}
          </p>
        </div>
      )}
    </div>
  )
}
