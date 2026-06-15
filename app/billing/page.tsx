'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const PLANS = {
  basic: {
    name: 'Basic',
    jobsPerDay: 3,
    features: [
      'Content Only & Ads Only modes',
      'Instagram, TikTok, YouTube, LinkedIn',
      '3 campaigns per day',
      'Remotion videos',
      'Telegram notifications'
    ]
  },
  pro: {
    name: 'Pro',
    jobsPerDay: 5,
    features: [
      'All modes including Full Run',
      'FlipBookPro ebook generation',
      '5 campaigns per day',
      'Atlas Cloud cinematic video',
      'Content & Ad refinement loops',
      'Priority processing'
    ]
  }
}

export default function BillingPage() {
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(data)
    }
    load()
  }, [])

  async function handleSubscribe(plan: string) {
    setLoading(true)
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan })
    })
    const { url } = await res.json()
    if (url) window.location.href = url
    setLoading(false)
  }

  async function handleManageBilling() {
    setLoading(true)
    const res = await fetch('/api/stripe/portal', { method: 'POST' })
    const { url } = await res.json()
    if (url) window.location.href = url
    setLoading(false)
  }

  const isActive = profile?.subscription_status === 'active'

  return (
    <main className="min-h-screen bg-black text-white p-8">
      <div className="max-w-3xl mx-auto">

        <div className="flex items-center justify-between mb-10">
          <div className="border-t-2 border-b-2 border-[#E8622A] px-4 py-2">
            <span className="text-xl font-black">RUN MY PC</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-gray-500 hover:text-white text-sm">← Jobs</Link>
            <Link href="/profile" className="text-gray-500 hover:text-white text-sm">Profile</Link>
          </div>
        </div>

        <h2 className="text-2xl font-black mb-8">Billing</h2>

        {isActive ? (
          <div className="p-6 border border-green-700 bg-green-900/20 rounded-lg mb-8">
            <p className="text-green-400 font-bold mb-2">✓ Active Subscription</p>
            <p className="text-gray-400 text-sm mb-4">Plan: {profile?.plan}</p>
            <button
              onClick={handleManageBilling}
              disabled={loading}
              className="px-6 py-2 border border-gray-700 text-gray-300 hover:border-[#E8622A] hover:text-white font-bold rounded-lg text-sm transition-all"
            >
              Manage Billing
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Object.entries(PLANS).map(([key, plan]) => (
              <div key={key} className={`p-6 rounded-lg border ${
                key === 'pro' ? 'border-[#E8622A] bg-[#E8622A]/5' : 'border-gray-700 bg-gray-900'
              }`}>
                {key === 'pro' && (
                  <span className="text-xs text-[#E8622A] font-bold uppercase tracking-widest mb-2 block">
                    Recommended
                  </span>
                )}
                <h3 className="text-xl font-black mb-1">{plan.name}</h3>
                <p className="text-gray-500 text-sm mb-4">{plan.jobsPerDay} campaigns/day</p>
                <ul className="space-y-2 mb-6">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                      <span className="text-[#E8622A] mt-0.5">✓</span>
                      {feature}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleSubscribe(key)}
                  disabled={loading}
                  className={`w-full py-3 font-black rounded-lg uppercase tracking-widest text-sm ${
                    key === 'pro'
                      ? 'bg-[#E8622A] hover:bg-[#d4551f] text-white'
                      : 'border border-gray-700 text-gray-300 hover:border-white hover:text-white'
                  }`}
                >
                  {loading ? 'Loading...' : `Get ${plan.name}`}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8">
          <Link href="/billing/success" className="text-gray-600 text-xs hover:text-gray-400">
            Already subscribed? Refresh your status
          </Link>
        </div>

      </div>
    </main>
  )
}
