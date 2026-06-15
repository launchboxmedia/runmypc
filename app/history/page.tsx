'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type Job = {
  id: string
  topic: string
  mode: string
  status: string
  current_phase: string | null
  created_at: string
  updated_at: string
  parent_job_id: string | null
}

const MODE_LABELS: Record<string, string> = {
  full_run: 'Full Run',
  ebook_only: 'Ebook Only',
  content_only: 'Content Only',
  ads_only: 'Ads Only'
}

const STATUS_COLORS: Record<string, string> = {
  completed: 'text-green-400',
  failed: 'text-red-400',
  running: 'text-[#E8622A]',
  queued: 'text-gray-400'
}

export default function HistoryPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    async function loadJobs() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data } = await supabase
        .from('jobs')
        .select('id, topic, mode, status, current_phase, created_at, updated_at, parent_job_id')
        .eq('user_id', user.id)
        .is('parent_job_id', null)
        .order('created_at', { ascending: false })
        .limit(50)

      setJobs(data || [])
      setLoading(false)
    }
    loadJobs()
  }, [])

  async function handleDelete(jobId: string) {
    if (!confirm('Delete this campaign? This cannot be undone.')) return
    await supabase.from('jobs').delete().eq('id', jobId)
    setJobs(prev => prev.filter(j => j.id !== jobId))
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  function formatDuration(created: string, updated: string) {
    const ms = new Date(updated).getTime() - new Date(created).getTime()
    const mins = Math.floor(ms / 60000)
    const secs = Math.floor((ms % 60000) / 1000)
    if (mins === 0) return `${secs}s`
    return `${mins}m ${secs}s`
  }

  return (
    <main className="min-h-screen bg-black text-white p-8">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div className="border-t-2 border-b-2 border-[#E8622A] px-4 py-2">
            <span className="text-xl font-black">RUN MY PC</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/" className="px-4 py-2 bg-[#E8622A] text-white text-sm font-bold rounded-lg">
              + New Campaign
            </Link>
            <Link href="/profile" className="text-gray-500 hover:text-white text-sm">Profile</Link>
            <Link href="/billing" className="text-gray-500 hover:text-white text-sm">Billing</Link>
          </div>
        </div>

        <h2 className="text-2xl font-black mb-6">Campaigns</h2>

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-900 rounded-lg animate-pulse"/>
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500 mb-4">No campaigns yet.</p>
            <Link href="/" className="px-6 py-3 bg-[#E8622A] text-white font-bold rounded-lg">
              Create Your First Campaign
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map(job => (
              <div key={job.id} className="p-4 bg-gray-900 rounded-lg border border-gray-800 hover:border-gray-700 transition-all">
                <div className="flex items-start justify-between gap-4">
                  <Link href={`/jobs/${job.id}`} className="flex-1 min-w-0">
                    <p className="font-bold text-white truncate mb-1">{job.topic}</p>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-xs text-gray-500 uppercase tracking-widest">
                        {MODE_LABELS[job.mode] || job.mode}
                      </span>
                      <span className={`text-xs font-bold ${STATUS_COLORS[job.status] || 'text-gray-400'}`}>
                        {job.status}
                      </span>
                      <span className="text-xs text-gray-600">
                        {formatDate(job.created_at)}
                      </span>
                      {job.status === 'completed' && (
                        <span className="text-xs text-gray-600">
                          {formatDuration(job.created_at, job.updated_at)}
                        </span>
                      )}
                    </div>
                  </Link>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/jobs/${job.id}`}
                      className="px-3 py-1 border border-gray-700 text-gray-400 hover:border-[#E8622A] hover:text-[#E8622A] text-xs font-bold rounded-lg transition-all"
                    >
                      View
                    </Link>
                    <button
                      onClick={() => handleDelete(job.id)}
                      className="px-3 py-1 border border-gray-800 text-gray-600 hover:border-red-800 hover:text-red-400 text-xs font-bold rounded-lg transition-all"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
