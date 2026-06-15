'use client'
import Link from 'next/link'

type Props = {
  jobId: string
  topic: string
  targetAudience: string | null
  outcome: string | null
  mode: string
  status: string
  error?: string | null
}

export function JobHeader({ jobId, topic, targetAudience, outcome, mode, status, error }: Props) {
  const startOverUrl = `/?topic=${encodeURIComponent(topic)}&audience=${encodeURIComponent(targetAudience || '')}&outcome=${encodeURIComponent(outcome || '')}`

  return (
    <div className="sticky top-0 z-10 bg-black border-b border-gray-900 px-6 py-4">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href={startOverUrl}
            className="border-t-2 border-b-2 border-[#E8622A] px-3 py-1 hover:bg-[#E8622A]/10 transition-colors"
          >
            <span className="text-sm font-black tracking-widest">← RUN MY PC</span>
          </Link>
          <div>
            <p className="font-bold text-white text-sm truncate max-w-sm">{topic}</p>
            {targetAudience && (
              <p className="text-xs text-gray-400 mt-0.5 truncate max-w-md">
                {targetAudience}
              </p>
            )}
            <div className="flex items-center gap-2 mt-1">
              {outcome && (
                <span className="inline-block text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded">
                  {outcome}
                </span>
              )}
              <span className="text-xs text-gray-500 uppercase tracking-widest">
                {mode.replace(/_/g, ' ')}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/history" className="text-gray-500 hover:text-white text-sm">History</Link>
          <Link href="/profile" className="text-gray-500 hover:text-white text-sm">Profile</Link>
          {status === 'running' || status === 'queued' ? (
            <span className="flex items-center gap-2 text-[#E8622A] text-sm">
              <span className="w-2 h-2 rounded-full bg-[#E8622A] animate-pulse"/>
              Running
            </span>
          ) : status === 'completed' ? (
            <>
              <span className="text-green-400 text-sm">✓ Complete</span>
              <Link
                href={startOverUrl}
                className="text-xs text-gray-500 hover:text-gray-400 transition-colors"
              >
                Adjust
              </Link>
            </>
          ) : status === 'failed' ? (
            <>
              <span className="text-red-400 text-sm">✗ Failed</span>
              <Link
                href={startOverUrl}
                className="text-xs text-gray-500 hover:text-gray-400 transition-colors"
              >
                Adjust
              </Link>
            </>
          ) : null}
        </div>
      </div>
      {error && (
        <div className="max-w-4xl mx-auto mt-2">
          <p className="text-red-400 text-xs">{error}</p>
        </div>
      )}
    </div>
  )
}
