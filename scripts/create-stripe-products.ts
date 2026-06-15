import Stripe from 'stripe'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-05-27.dahlia'
})

async function main() {
  // Create Basic product
  const basicProduct = await stripe.products.create({
    name: 'RunMyPC Basic',
    description: '3 campaigns per day, content and ads generation'
  })

  const basicPrice = await stripe.prices.create({
    product: basicProduct.id,
    unit_amount: 2900, // $29.00
    currency: 'usd',
    recurring: { interval: 'month' }
  })

  console.log('Basic Product ID:', basicProduct.id)
  console.log('Basic Price ID:', basicPrice.id)

  // Create Pro product
  const proProduct = await stripe.products.create({
    name: 'RunMyPC Pro',
    description: '5 campaigns per day, full run including ebook generation, cinematic video, refinement loops'
  })

  const proPrice = await stripe.prices.create({
    product: proProduct.id,
    unit_amount: 7900, // $79.00
    currency: 'usd',
    recurring: { interval: 'month' }
  })

  console.log('Pro Product ID:', proProduct.id)
  console.log('Pro Price ID:', proPrice.id)

  console.log('\nAdd to .env.local:')
  console.log(`STRIPE_PRICE_BASIC_MONTHLY=${basicPrice.id}`)
  console.log(`STRIPE_PRICE_PRO_MONTHLY=${proPrice.id}`)
}

main().catch(console.error)
