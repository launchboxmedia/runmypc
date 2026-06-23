'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { JobHeader } from '@/components/canvas/JobHeader'
import { CompletionBanner } from '@/components/canvas/CompletionBanner'
import { EbookSection } from '@/components/canvas/EbookSection'
import { ContentSection } from '@/components/canvas/ContentSection'
import { AdSection } from '@/components/canvas/AdSection'
import { LoopSection } from '@/components/canvas/LoopSection'

type Job = {
  id: string
  topic: string
  target_audience: string | null
  outcome: string | null
  mode: string
  status: string
  current_phase: string | null
  current_step: string | null
  error: string | null
  parent_job_id: string | null
  loop_type: string | null
  job_steps: any[]
  job_outputs: any[]
}

export default function JobCanvas() {
  const { jobId } = useParams()
  const [job, setJob] = useState<Job | null>(null)
  const [loopJobs, setLoopJobs] = useState<any[]>([])
  const [error, setError] = useState('')

  const fetchJob = useCallback(async () => {
    const res = await fetch(`/api/jobs/${jobId}`)
    if (!res.ok) { setError('Job not found'); return }
    const data = await res.json()
    setJob(data.job)

    const loopsRes = await fetch(`/api/jobs?parent_job_id=${jobId}`)
    if (loopsRes.ok) {
      const loopsData = await loopsRes.json()
      setLoopJobs(loopsData.jobs || [])
    }
  }, [jobId])

  useEffect(() => {
    fetchJob()
  }, [fetchJob])

  useEffect(() => {
    if (!job) return
    const allDone = job.status === 'completed' &&
      loopJobs.every(l => l.status === 'completed' || l.status === 'failed')
    if (allDone) return
    const interval = setInterval(fetchJob, 5000)
    return () => clearInterval(interval)
  }, [job, loopJobs, fetchJob])

  async function handleKeepRunning() {
    await fetch(`/api/jobs/${jobId}/trigger-loops`, { method: 'POST' })
    setTimeout(fetchJob, 1000)
  }

  if (error) return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center">
      <p className="text-red-400">{error}</p>
    </main>
  )

  if (!job) return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center">
      <p className="text-gray-400">Loading...</p>
    </main>
  )

  const isEbookActive = ['full_run', 'ebook_only'].includes(job.mode) && (
    job.current_phase === 'book_generation' ||
    job.job_outputs.some(o => o.output_type === 'flipbook_url')
  )

  // Content section stays active once ANY content output exists — not just a
  // static_creative. (Instagram/TikTok statics were removed in favour of the
  // carousel, so keying off static_creative alone hid the whole section when the
  // carousel didn't produce one.)
  const CONTENT_OUTPUT_TYPES = [
    'static_creative', 'social_post', 'social_video', 'platform_video',
    'cinematic_video', 'niche_research',
  ]
  const isContentActive = ['full_run', 'content_only'].includes(job.mode) && (
    job.current_phase === 'content_generation' ||
    job.job_outputs.some(o => CONTENT_OUTPUT_TYPES.includes(o.output_type))
  )

  const isAdActive = ['full_run', 'ads_only'].includes(job.mode) && (
    job.current_phase === 'ad_generation' ||
    job.job_outputs.some(o =>
      o.output_type === 'ad_copy' && o.metadata?.type === 'ad_copy'
    )
  )

  const refinedOutputs = loopJobs
    .filter(l => l.loop_type === 'content_refinement')
    .flatMap((l: any) => l.job_outputs || [])

  const adTestOutputs = loopJobs
    .filter(l => l.loop_type === 'ad_testing')
    .flatMap((l: any) => l.job_outputs || [])

  const allOutputs = [...job.job_outputs, ...refinedOutputs, ...adTestOutputs]

  const isComplete = job.status === 'completed'
  const loopsRunning = loopJobs.some(l => l.status === 'running' || l.status === 'queued')
  const loopsComplete = loopJobs.length > 0 &&
    loopJobs.every(l => l.status === 'completed' || l.status === 'failed')
  const showKeepRunning = isComplete && loopJobs.length === 0
  const showBanner = isComplete && !loopsRunning

  return (
    <main className="min-h-screen bg-black text-white">
      <JobHeader
        jobId={job.id}
        topic={job.topic}
        targetAudience={job.target_audience}
        outcome={job.outcome}
        mode={job.mode}
        status={loopsRunning ? 'running' : job.status}
        error={job.error}
        onCancel={fetchJob}
      />

      <div className="max-w-4xl mx-auto px-6 py-8">

        {showBanner && loopsComplete && (
          <CompletionBanner
            jobId={job.id}
            showKeepRunning={false}
          />
        )}

        {showBanner && !loopsRunning && loopJobs.length === 0 && (
          <CompletionBanner
            jobId={job.id}
            showKeepRunning={showKeepRunning}
            onKeepRunning={handleKeepRunning}
          />
        )}

        <EbookSection
          steps={job.job_steps}
          outputs={job.job_outputs}
          isActive={isEbookActive}
        />

        <ContentSection
          outputs={allOutputs}
          isActive={isContentActive}
          isRefined={refinedOutputs.length > 0}
        />

        <AdSection
          outputs={allOutputs}
          isActive={isAdActive}
        />

        <LoopSection
          loopJobs={loopJobs}
          onKeepRunning={handleKeepRunning}
          showKeepRunning={showKeepRunning}
        />

      </div>
    </main>
  )
}
