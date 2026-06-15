import { createAdminClient } from '@/lib/supabase/admin'

export async function checkRateLimit(userId: string): Promise<{
  allowed: boolean
  reason?: string
}> {
  const supabase = createAdminClient()

  // Get user plan
  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_status, plan')
    .eq('id', userId)
    .single()

  // Check subscription
  if (profile?.subscription_status !== 'active') {
    return {
      allowed: false,
      reason: 'An active subscription is required. Please subscribe to run campaigns.'
    }
  }

  // Check concurrent jobs
  const { count: runningCount } = await supabase
    .from('jobs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['queued', 'running'])

  if ((runningCount || 0) > 0) {
    return {
      allowed: false,
      reason: 'You already have a job running. Wait for it to complete before starting a new one.'
    }
  }

  // Check daily limit based on plan
  const dailyLimit = profile?.plan === 'pro' ? 5 : 3
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { count: dailyCount } = await supabase
    .from('jobs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('parent_job_id', null)
    .gte('created_at', dayAgo)

  if ((dailyCount || 0) >= dailyLimit) {
    return {
      allowed: false,
      reason: `You have reached your daily limit of ${dailyLimit} campaigns. Try again tomorrow or upgrade your plan.`
    }
  }

  return { allowed: true }
}
