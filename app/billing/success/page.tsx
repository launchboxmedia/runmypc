'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function BillingSuccessPage() {
  const router = useRouter()

  useEffect(() => {
    setTimeout(() => router.push('/'), 3000)
  }, [])

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center p-8">
      <div className="text-center">
        <div className="inline-block border-t-4 border-b-4 border-[#E8622A] px-6 py-3 mb-8">
          <h1 className="text-4xl font-black">RUN MY PC</h1>
        </div>
        <p className="text-green-400 font-bold text-xl mb-4">✓ Subscription Active</p>
        <p className="text-gray-400 mb-6">You're all set. Redirecting you to the dashboard...</p>
        <Link href="/" className="text-[#E8622A] hover:underline">Go now →</Link>
      </div>
    </main>
  )
}
