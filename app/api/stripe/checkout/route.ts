import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createCheckoutSession, PLANS } from '@/lib/stripe'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { plan } = await req.json()
  const planConfig = PLANS[plan as keyof typeof PLANS]
  if (!planConfig) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL!

  const url = await createCheckoutSession({
    userId: user.id,
    email: user.email!,
    priceId: planConfig.price,
    successUrl: `${baseUrl}/billing/success`,
    cancelUrl: `${baseUrl}/billing`
  })

  return NextResponse.json({ url })
}
