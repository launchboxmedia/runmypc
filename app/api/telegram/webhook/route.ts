import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendMessage } from '@/lib/telegram'

type TelegramUpdate = {
  message?: {
    chat: { id: number }
    text?: string
    from: { id: number; first_name: string }
  }
}

export async function POST(req: Request) {
  const update: TelegramUpdate = await req.json()
  const message = update.message
  if (!message?.text) return NextResponse.json({ ok: true })

  const chatId = String(message.chat.id)
  const text = message.text.trim()
  const supabase = createAdminClient()

  // Find user by telegram_chat_id
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, subscription_status')
    .eq('telegram_chat_id', chatId)
    .single()

  // Handle /start
  if (text === '/start') {
    await sendMessage(chatId, `👋 Welcome to <b>RUN MY PC</b>

I'm your AI campaign agent. I'll create ebooks, social content, and ads for you automatically.

To get started, go to your profile and enter your Telegram Chat ID: <code>${chatId}</code>

Then come back and use /run to create your first campaign.`)
    return NextResponse.json({ ok: true })
  }

  // Require registered user for everything else
  if (!profile) {
    await sendMessage(chatId, `You're not registered yet.

Your Chat ID is: <code>${chatId}</code>

Add it to your RunMyPC profile at ${process.env.NEXT_PUBLIC_APP_URL}/profile`)
    return NextResponse.json({ ok: true })
  }

  // Check subscription
  if (profile.subscription_status !== 'active' && !text.startsWith('/start')) {
    await sendMessage(chatId, `You need an active subscription to use RunMyPC.

Subscribe at: ${process.env.NEXT_PUBLIC_APP_URL}/billing`)
    return NextResponse.json({ ok: true })
  }

  // /run command
  if (text.startsWith('/run')) {
    const topic = text.replace('/run', '').trim()
    if (!topic) {
      await sendMessage(chatId, `Please provide a topic after /run

Example:
<code>/run 0% business credit cards for entrepreneurs</code>`)
      return NextResponse.json({ ok: true })
    }

    // Create job
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-user-id': profile.id
      },
      body: JSON.stringify({
        topic,
        target_audience: '',
        outcome: '',
        mode: 'content_only'
      })
    })

    const data = await res.json()

    if (!res.ok) {
      await sendMessage(chatId, `❌ Could not start campaign: ${data.error}`)
      return NextResponse.json({ ok: true })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    await sendMessage(chatId, `🚀 <b>Campaign Started</b>

<b>Topic:</b> ${topic}
<b>Mode:</b> Content Only

Agents are working... I'll update you at each step.

<a href="${baseUrl}/jobs/${data.jobId}">View Live Canvas →</a>`)

    return NextResponse.json({ ok: true })
  }

  // /status command
  if (text === '/status') {
    const { data: jobs } = await supabase
      .from('jobs')
      .select('id, topic, status, current_step, created_at')
      .eq('user_id', profile.id)
      .is('parent_job_id', null)
      .order('created_at', { ascending: false })
      .limit(3)

    if (!jobs?.length) {
      await sendMessage(chatId, 'No campaigns yet. Use /run to create one.')
      return NextResponse.json({ ok: true })
    }

    const statusEmoji: Record<string, string> = {
      completed: '✅',
      failed: '❌',
      running: '⚡',
      queued: '⏳'
    }

    const statusText = jobs.map(j =>
      `${statusEmoji[j.status] || '?'} ${j.topic.slice(0, 40)}${j.topic.length > 40 ? '...' : ''}\n   ${j.status}${j.current_step ? ` — ${j.current_step}` : ''}`
    ).join('\n\n')

    await sendMessage(chatId, `📊 <b>Recent Campaigns</b>\n\n${statusText}`)
    return NextResponse.json({ ok: true })
  }

  // /copy [platform] command
  if (text.startsWith('/copy')) {
    const platform = text.replace('/copy', '').trim().toLowerCase()

    // Get most recent completed job
    const { data: job } = await supabase
      .from('jobs')
      .select('id, topic, job_outputs(*)')
      .eq('user_id', profile.id)
      .eq('status', 'completed')
      .is('parent_job_id', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!job) {
      await sendMessage(chatId, 'No completed campaigns found.')
      return NextResponse.json({ ok: true })
    }

    const posts = (job.job_outputs as any[])
      .filter(o => o.output_type === 'ad_copy' &&
        o.metadata?.type === 'social_post' &&
        (!platform || o.platform === platform))

    if (!posts.length) {
      await sendMessage(chatId, `No ${platform || 'social'} posts found for your last campaign.`)
      return NextResponse.json({ ok: true })
    }

    for (const post of posts.slice(0, 3)) {
      try {
        const parsed = JSON.parse(post.content || '{}')
        const text = [
          parsed.hook,
          '',
          parsed.body,
          '',
          parsed.cta,
          '',
          parsed.hashtags?.join(' ')
        ].filter(l => l !== undefined).join('\n')

        await sendMessage(chatId, `<b>${post.platform?.toUpperCase()} Post</b>\n\n${text}`)
        await new Promise(resolve => setTimeout(resolve, 500))
      } catch (err) {
        console.error('Failed to send post:', err)
      }
    }

    return NextResponse.json({ ok: true })
  }

  // /history command
  if (text === '/history') {
    const { data: jobs } = await supabase
      .from('jobs')
      .select('id, topic, mode, status, created_at')
      .eq('user_id', profile.id)
      .is('parent_job_id', null)
      .order('created_at', { ascending: false })
      .limit(5)

    if (!jobs?.length) {
      await sendMessage(chatId, 'No campaigns yet.')
      return NextResponse.json({ ok: true })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    const historyText = jobs.map((j, i) =>
      `${i + 1}. <a href="${baseUrl}/jobs/${j.id}">${j.topic.slice(0, 40)}</a>\n   ${j.status} · ${j.mode.replace(/_/g, ' ')}`
    ).join('\n\n')

    await sendMessage(chatId, `📋 <b>Campaign History</b>\n\n${historyText}`)
    return NextResponse.json({ ok: true })
  }

  // /refine command
  if (text === '/refine') {
    const { data: job } = await supabase
      .from('jobs')
      .select('id')
      .eq('user_id', profile.id)
      .eq('status', 'completed')
      .is('parent_job_id', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!job) {
      await sendMessage(chatId, 'No completed campaigns to refine.')
      return NextResponse.json({ ok: true })
    }

    await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/jobs/${job.id}/trigger-loops`, {
      method: 'POST'
    })

    await sendMessage(chatId, '🔄 Content refinement loop started. I\'ll let you know when done.')
    return NextResponse.json({ ok: true })
  }

  // /download command
  if (text === '/download') {
    const { data: job } = await supabase
      .from('jobs')
      .select('id, topic')
      .eq('user_id', profile.id)
      .eq('status', 'completed')
      .is('parent_job_id', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!job) {
      await sendMessage(chatId, 'No completed campaigns found.')
      return NextResponse.json({ ok: true })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    await sendMessage(chatId,
      `📦 <a href="${baseUrl}/api/jobs/${job.id}/download">Download All Assets (ZIP)</a>\n\n${job.topic}`)
    return NextResponse.json({ ok: true })
  }

  // Help / unknown command
  await sendMessage(chatId, `<b>RunMyPC Commands</b>

/run [topic] — Start a new campaign
/status — Check current campaign status
/copy [platform] — Get posts (instagram, tiktok, youtube, linkedin)
/download — Get ZIP of all assets
/refine — Run content refinement loop
/history — View recent campaigns

Example:
<code>/run 0% business credit cards for entrepreneurs with no revenue</code>`)

  return NextResponse.json({ ok: true })
}
