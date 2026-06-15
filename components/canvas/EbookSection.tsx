'use client'

type JobStep = {
  step_key: string
  step_label: string
  status: string
  phase: string
}

type JobOutput = {
  id: string
  output_type: string
  label: string
  url: string | null
  content: string | null
  metadata: any
}

type Props = {
  steps: JobStep[]
  outputs: JobOutput[]
  isActive: boolean
}

export function EbookSection({ steps, outputs, isActive }: Props) {
  if (!isActive) return null

  const ebookSteps = steps.filter(s => s.phase === 'book_generation')
  const chapterSteps = ebookSteps.filter(s => s.step_key.startsWith('generate-chapter-'))
  const flipbookOutput = outputs.find(o => o.output_type === 'flipbook_url')
  const pdfOutput = outputs.find(o => o.output_type === 'pdf_url')
  const salesOutput = outputs.find(o => o.output_type === 'sales_page_url')

  return (
    <div className="mb-16">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-full bg-[#E8622A] flex items-center justify-center text-white font-black text-sm">
          1
        </div>
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">
          Ebook Agent
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Cover + Links */}
        <div>
          <div className={`aspect-[3/4] rounded-lg border-2 flex items-center justify-center mb-4 ${
            flipbookOutput
              ? 'border-green-700 bg-green-900/10'
              : 'border-[#E8622A] bg-gray-900 animate-pulse'
          }`}>
            {flipbookOutput ? (
              <p className="text-green-400 text-sm font-bold">✓ Published</p>
            ) : (
              <p className="text-gray-600 text-sm">Generating...</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {flipbookOutput?.url && (
              <a href={flipbookOutput.url} target="_blank" rel="noopener noreferrer"
                className="block text-center py-2 bg-[#E8622A] text-white text-sm font-bold rounded-lg hover:bg-[#d4551f]">
                View Flipbook
              </a>
            )}
            {pdfOutput?.url && (
              <a href={pdfOutput.url} target="_blank" rel="noopener noreferrer"
                className="block text-center py-2 border border-gray-700 text-gray-300 text-sm font-bold rounded-lg hover:border-gray-500">
                Download PDF
              </a>
            )}
            {salesOutput?.url && (
              <a href={salesOutput.url} target="_blank" rel="noopener noreferrer"
                className="block text-center py-2 border border-gray-700 text-gray-300 text-sm font-bold rounded-lg hover:border-gray-500">
                View Sales Page
              </a>
            )}
          </div>
        </div>

        {/* Chapter List */}
        <div className="space-y-2">
          {chapterSteps.length === 0 ? (
            [...Array(6)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-900 rounded-lg animate-pulse border border-gray-800"/>
            ))
          ) : (
            chapterSteps.map(step => (
              <div key={step.step_key} className={`p-3 rounded-lg border transition-all ${
                step.status === 'running'
                  ? 'border-[#E8622A] bg-[#E8622A]/5'
                  : step.status === 'completed'
                  ? 'border-green-800 bg-green-900/10'
                  : 'border-gray-800 bg-gray-900'
              }`}>
                <div className="flex items-center gap-3">
                  <span className={`text-sm ${
                    step.status === 'completed' ? 'text-green-400' :
                    step.status === 'running' ? 'text-[#E8622A]' :
                    'text-gray-600'
                  }`}>
                    {step.status === 'completed' ? '✓' :
                     step.status === 'running' ? '▶' : '○'}
                  </span>
                  <p className={`text-sm ${
                    step.status === 'running' ? 'text-white' : 'text-gray-400'
                  }`}>
                    {step.step_label}
                  </p>
                  {step.status === 'running' && (
                    <span className="ml-auto text-xs text-[#E8622A] animate-pulse">
                      Writing...
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
