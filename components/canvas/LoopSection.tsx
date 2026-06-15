'use client'

type LoopJob = {
  id: string
  loop_type: string | null
  status: string
  loop_number: number
}

type Props = {
  loopJobs: LoopJob[]
  onKeepRunning: () => void
  showKeepRunning: boolean
}

export function LoopSection({ loopJobs, onKeepRunning, showKeepRunning }: Props) {
  if (loopJobs.length === 0 && !showKeepRunning) return null

  return (
    <div className="mb-16">
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">
          Agent Loops
        </h2>
      </div>

      <div className="space-y-3">
        {loopJobs.map(loop => (
          <div key={loop.id} className={`p-4 rounded-lg border ${
            loop.status === 'completed' ? 'border-green-700 bg-green-900/10' :
            loop.status === 'running' ? 'border-[#E8622A] bg-[#E8622A]/5' :
            'border-gray-800 bg-gray-900'
          }`}>
            <div className="flex items-center gap-3">
              <span className={
                loop.status === 'completed' ? 'text-green-400' :
                loop.status === 'running' ? 'text-[#E8622A]' :
                'text-gray-600'
              }>
                {loop.status === 'completed' ? '✓' :
                 loop.status === 'running' ? '▶' : '○'}
              </span>
              <div>
                <p className="text-sm font-bold text-white">
                  {loop.loop_type === 'content_refinement'
                    ? 'Content Refinement Loop'
                    : 'Ad Testing Loop'}
                </p>
                <p className="text-xs text-gray-500 capitalize">{loop.status}</p>
              </div>
              {loop.status === 'running' && (
                <span className="ml-auto text-xs text-[#E8622A] animate-pulse">
                  Running...
                </span>
              )}
            </div>
          </div>
        ))}

        {showKeepRunning && (
          <button
            onClick={onKeepRunning}
            className="w-full p-4 border-2 border-dashed border-gray-700 hover:border-[#E8622A] rounded-lg text-gray-500 hover:text-[#E8622A] text-sm font-bold transition-all uppercase tracking-widest"
          >
            + Keep Running — Refine & Test
          </button>
        )}
      </div>
    </div>
  )
}
