import Stripe from 'stripe'

let stripeInstance: Stripe | null = null

export function getStripe(): Stripe {
  if (!stripeInstance) {
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-05-27.dahlia'
    })
  }
  return stripeInstance
}

export const stripe = getStripe()

export const PLANS = {
  basic: {
    name: 'Basic',
    price: process.env.STRIPE_PRICE_BASIC_MONTHLY!,
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
    price: process.env.STRIPE_PRICE_PRO_MONTHLY!,
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

export async function createCheckoutSession(params: {
  userId: string
  email: string
  priceId: string
  successUrl: string
  cancelUrl: string
}): Promise<string> {
  const { userId, email, priceId, successUrl, cancelUrl} = params
  const stripe = getStripe()

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    customer_email: email,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { userId }
  })

  return session.url!
}

export async function createBillingPortalSession(customerId: string, returnUrl: string): Promise<string> {
  const stripe = getStripe()
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl
  })
  return session.url
}
