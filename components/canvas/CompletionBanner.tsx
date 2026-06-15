'use client'

type Props = {
  jobId: string
  onKeepRunning?: () => void
  showKeepRunning?: boolean
}

export function CompletionBanner({ jobId, onKeepRunning, showKeepRunning }: Props) {
  return (
    <div className="w-full border border-green-700 bg-green-900/20 rounded-lg p-6 mb-8">
      <div className="max-w-4xl mx-auto flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-green-400 font-bold text-lg">Your campaign is ready.</p>
          <p className="text-gray-400 text-sm mt-1">All agents have completed their work.</p>
        </div>
        <div className="flex items-center gap-3">
          {showKeepRunning && onKeepRunning && (
            <button
              onClick={onKeepRunning}
              className="px-6 py-3 border-2 border-[#E8622A] text-[#E8622A] hover:bg-[#E8622A] hover:text-white font-bold rounded-lg transition-all text-sm uppercase tracking-widest"
            >
              Keep Running
            </button>
          )}
          <a
            href={`/api/jobs/${jobId}/download`}
            className="px-6 py-3 bg-[#E8622A] hover:bg-[#d4551f] text-white font-bold rounded-lg text-sm uppercase tracking-widest"
          >
            Download Everything
          </a>
        </div>
      </div>
    </div>
  )
}
