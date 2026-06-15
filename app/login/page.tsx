'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin() {
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/')
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="inline-block border-t-4 border-b-4 border-[#E8622A] px-6 py-3 mb-6">
            <h1 className="text-4xl font-black tracking-tight leading-none">RUN</h1>
            <h1 className="text-4xl font-black tracking-tight leading-none">MY PC</h1>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-widest mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-[#E8622A]"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-widest mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-[#E8622A]"
              placeholder="••••••••"
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            onClick={handleLogin}
            disabled={loading || !email || !password}
            className="w-full py-3 bg-[#E8622A] hover:bg-[#d4551f] disabled:opacity-50 text-white font-black rounded-lg uppercase tracking-widest"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <p className="text-center text-gray-500 text-sm">
            No account?{' '}
            <Link href="/signup" className="text-[#E8622A] hover:underline">Sign up</Link>
          </p>
        </div>
      </div>
    </main>
  )
}
