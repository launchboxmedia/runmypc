'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // Check if user came from email link
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        // User clicked reset link, ready to set new password
      }
    })
  }, [supabase])

  async function handleReset() {
    setLoading(true)
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.updateUser({
      password: password
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)

    // Redirect to login after 2 seconds
    setTimeout(() => {
      router.push('/login')
    }, 2000)
  }

  if (success) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center p-8">
        <div className="w-full max-w-sm text-center">
          <div className="inline-block border-t-4 border-b-4 border-[#E8622A] px-6 py-3 mb-10">
            <h1 className="text-4xl font-black tracking-tight leading-none">RUN</h1>
            <h1 className="text-4xl font-black tracking-tight leading-none">MY PC</h1>
          </div>

          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-3">Password updated</h2>
            <p className="text-gray-400 text-sm">
              Redirecting to login...
            </p>
          </div>
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
          <p className="text-gray-400 text-sm">Enter your new password</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-widest mb-2">New Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-[#E8622A]"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-widest mb-2">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-[#E8622A]"
              placeholder="••••••••"
              onKeyDown={e => e.key === 'Enter' && handleReset()}
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            onClick={handleReset}
            disabled={loading || !password || !confirmPassword}
            className="w-full py-3 bg-[#E8622A] hover:bg-[#d4551f] disabled:opacity-50 text-white font-black rounded-lg uppercase tracking-widest"
          >
            {loading ? 'Updating...' : 'Update Password'}
          </button>

          <p className="text-center text-gray-500 text-sm">
            <Link href="/login" className="text-[#E8622A] hover:underline">Back to login</Link>
          </p>
        </div>
      </div>
    </main>
  )
}
