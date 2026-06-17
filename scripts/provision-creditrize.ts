import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function provisionUser() {
  const email = 'creditrize2026@gmail.com'
  const password = 'TestPassword123!'

  console.log(`Provisioning ${email}...`)

  // Try creating, if exists then update
  let userId: string

  const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  })

  if (createError) {
    if (createError.message.includes('already been registered')) {
      console.log('User exists, fetching...')

      // Query profile to get user ID
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .single()

      if (!profile) {
        console.error('User exists but profile not found')
        process.exit(1)
      }

      userId = profile.id
      console.log(`Found user (ID: ${userId})`)

      // Update password
      const { error: pwError } = await supabase.auth.admin.updateUserById(userId, {
        password
      })
      if (pwError) console.error('Password update error:', pwError)
      else console.log('Password updated')
    } else {
      console.error('Create error:', createError)
      process.exit(1)
    }
  } else {
    userId = newUser.user.id
    console.log(`User created (ID: ${userId})`)
  }

  // Update profile to Pro
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: userId,
      email,
      subscription_tier: 'pro',
      subscription_status: 'active'
    })

  if (profileError) {
    console.error('Profile error:', profileError)
    process.exit(1)
  }

  console.log('✅ Pro user provisioned')
  console.log(`Email: ${email}`)
  console.log(`Password: ${password}`)
  console.log(`Tier: pro`)
}

provisionUser()
