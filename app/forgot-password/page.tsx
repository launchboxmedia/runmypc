'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const supabase = createClient()

  async function handleReset() {
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  if (success) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center p-8">
        <div className="w-full max-w-sm text-center">
          <div className="inline-block border-t-4 border-b-4 border-[#E8622A] px-6 py-3 mb-10">
            <h1 className="text-4xl font-black tracking-tight leading-none">RUN</h1>
            <h1 className="text-4xl font-black tracking-tight leading-none">MY PC</h1>
          </div>

          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-bold mb-3">Check your email</h2>
            <p className="text-gray-400 text-sm">
              Password reset link sent to <span className="text-white">{email}</span>
            </p>
          </div>

          <Link
            href="/login"
            className="text-[#E8622A] hover:underline text-sm"
          >
            Back to login
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="inline-block border-t-4 border-b-4 border-[#E8622A] px-6 py-3 mb-6">
            <h1 className="text-4xl font-black tracking-tight leading-none">RUN</h1>
            <h1 className="text-4xl font-black tracking-tight leading-none">MY PC</h1>
          </div>
          <p className="text-gray-400 text-sm">Enter your email to reset password</p>
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
              onKeyDown={e => e.key === 'Enter' && handleReset()}
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            onClick={handleReset}
            disabled={loading || !email}
            className="w-full py-3 bg-[#E8622A] hover:bg-[#d4551f] disabled:opacity-50 text-white font-black rounded-lg uppercase tracking-widest"
          >
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>

          <p className="text-center text-gray-500 text-sm">
            Remember your password?{' '}
            <Link href="/login" className="text-[#E8622A] hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </main>
  )
}
