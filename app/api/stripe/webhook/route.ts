import { NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  const body = await req.text()
  const signature = req.headers.get('stripe-signature')!

  let event
  try {
    const stripe = getStripe()
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createAdminClient()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as any
      const userId = session.metadata.userId
      const customerId = session.customer

      await supabase.from('profiles').update({
        stripe_customer_id: customerId,
        stripe_subscription_id: session.subscription,
        subscription_status: 'active',
        plan: 'basic'
      }).eq('id', userId)
      break
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as any
      const customerId = subscription.customer

      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .single()

      if (profile) {
        const status = subscription.status === 'active' ? 'active' : 'inactive'
        await supabase.from('profiles').update({
          subscription_status: status,
          stripe_subscription_id: subscription.id
        }).eq('id', profile.id)
      }
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as any
      const customerId = subscription.customer

      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .single()

      if (profile) {
        await supabase.from('profiles').update({
          subscription_status: 'inactive',
          plan: 'free'
        }).eq('id', profile.id)
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
