import Stripe from 'stripe'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-05-27.dahlia'
})

const WEBHOOK_URL = 'https://runmypc-9vgzihh56-richs-projects-5160eaeb.vercel.app/api/stripe/webhook'

async function main() {
  const webhook = await stripe.webhookEndpoints.create({
    url: WEBHOOK_URL,
    enabled_events: [
      'checkout.session.completed',
      'customer.subscription.updated',
      'customer.subscription.deleted'
    ]
  })

  console.log('Webhook Endpoint ID:', webhook.id)
  console.log('Webhook Secret:', webhook.secret)
  console.log('\nAdd to Vercel:')
  console.log(`echo "${webhook.secret}" | vercel env add STRIPE_WEBHOOK_SECRET production`)
}

main().catch(console.error)
