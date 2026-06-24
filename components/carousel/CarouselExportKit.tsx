'use client'

type CtaMeta = {
  keyword?: string
  ig_index?: number
  tt_index?: number
}

type Props = {
  slideUrls: string[]  // signed slide URLs from ContentSection
  ctaMeta: CtaMeta | null
}

function PlatformCard({
  platform,
  videoUrl,
  accentColor,
  label,
  icon,
}: {
  platform: string
  videoUrl: string | null
  accentColor: string
  label: string
  icon: React.ReactNode
}) {
  return (
    <div className="flex-1 border border-gray-700 flex flex-col overflow-hidden">
      {/* Header bar */}
      <div
        className="px-4 py-3 flex items-center gap-3"
        style={{ background: accentColor === 'ig' ? 'linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)' : '#010101' }}
      >
        <span className="w-5 h-5 text-white flex-shrink-0">{icon}</span>
        <span className="text-xs font-black uppercase tracking-widest text-white">{platform}</span>
      </div>

      {/* Slide preview */}
      <div className="aspect-[4/5] bg-gray-900 border-b border-gray-700">
        {videoUrl ? (
          <video
            src={videoUrl}
            className="w-full h-full object-cover"
            muted
            playsInline
            autoPlay
            loop
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <p className="text-xs text-gray-700 uppercase tracking-widest">Generating…</p>
          </div>
        )}
      </div>

      {/* Export button */}
      <div className="p-4">
        <p className="text-xs text-gray-500 mb-3">{label}</p>
        {videoUrl ? (
          <a
            href={videoUrl}
            download
            className="block w-full py-3 text-center text-xs font-black uppercase tracking-widest border border-gray-700 text-white hover:bg-white hover:text-black transition-all"
            style={{ borderRadius: 0 }}
          >
            Export for {platform}
          </a>
        ) : (
          <div className="py-3 text-center text-xs text-gray-700 border border-gray-800 uppercase tracking-widest">
            Not ready
          </div>
        )}
      </div>
    </div>
  )
}

const IG_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="1.5" fill="white" stroke="none" />
  </svg>
)

const TT_ICON = (
  <svg viewBox="0 0 24 24" className="w-full h-full">
    <path fill="white" d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.24 6.24 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.73a8.12 8.12 0 0 0 4.75 1.52V6.81a4.87 4.87 0 0 1-1-.12z" />
  </svg>
)

export function CarouselExportKit({ slideUrls, ctaMeta }: Props) {
  const igIndex = ctaMeta?.ig_index ?? slideUrls.length - 2
  const ttIndex = ctaMeta?.tt_index ?? slideUrls.length - 1
  const igUrl = slideUrls[igIndex] ?? null
  const ttUrl = slideUrls[ttIndex] ?? null

  return (
    <div className="mt-8">
      {/* Divider */}
      <div className="flex items-center gap-4 mb-6">
        <div className="h-px flex-1 bg-gray-800" />
        <span className="text-xs font-black uppercase tracking-widest text-gray-500">
          Modular Export Kit
        </span>
        <div className="h-px flex-1 bg-gray-800" />
      </div>

      {/* Automation badge */}
      {ctaMeta?.keyword && (
        <div className="mb-6 flex items-center justify-between border border-[#E8622A] px-4 py-3">
          <div>
            <p className="text-xs font-bold text-[#E8622A] uppercase tracking-widest mb-0.5">
              Manychat Automation Keyword
            </p>
            <p className="text-xl font-black text-white tracking-wide">{ctaMeta.keyword}</p>
          </div>
          <div className="text-xs text-gray-500 text-right">
            <p>Plug into</p>
            <p>your flow</p>
          </div>
        </div>
      )}

      {/* Platform cards */}
      <div className="flex gap-4">
        <PlatformCard
          platform="Instagram"
          videoUrl={igUrl}
          accentColor="ig"
          label="Comment automation — Manychat DM trigger"
          icon={IG_ICON}
        />
        <PlatformCard
          platform="TikTok"
          videoUrl={ttUrl}
          accentColor="tt"
          label="DM automation — Manychat auto-reply"
          icon={TT_ICON}
        />
      </div>
    </div>
  )
}
