const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`

export async function sendMessage(chatId: string, text: string, options?: {
  parseMode?: 'HTML' | 'Markdown'
  replyMarkup?: any
}): Promise<void> {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: options?.parseMode || 'HTML',
      reply_markup: options?.replyMarkup
    })
  }).catch(err => console.error('Telegram sendMessage failed:', err))
}

export async function sendDocument(chatId: string, url: string, caption?: string): Promise<void> {
  await fetch(`${TELEGRAM_API}/sendDocument`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      document: url,
      caption
    })
  }).catch(err => console.error('Telegram sendDocument failed:', err))
}

export async function sendVideo(chatId: string, url: string, caption?: string): Promise<void> {
  await fetch(`${TELEGRAM_API}/sendVideo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      video: url,
      caption
    })
  }).catch(err => console.error('Telegram sendVideo failed:', err))
}

export async function sendPhoto(chatId: string, url: string, caption?: string): Promise<void> {
  await fetch(`${TELEGRAM_API}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      photo: url,
      caption
    })
  }).catch(err => console.error('Telegram sendPhoto failed:', err))
}

export function buildJobStartMessage(job: { topic: string; mode: string; id: string }): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
  return `🚀 <b>Campaign Started</b>

<b>Topic:</b> ${job.topic}
<b>Mode:</b> ${job.mode.replace(/_/g, ' ').toUpperCase()}

Agents are working... I'll update you at each step.

<a href="${baseUrl}/jobs/${job.id}">View Live Canvas →</a>`
}

export function buildStepUpdateMessage(stepLabel: string, phase: string): string {
  const phaseEmoji: Record<string, string> = {
    book_generation: '📚',
    content_generation: '📱',
    ad_generation: '🎯'
  }
  return `${phaseEmoji[phase] || '⚡'} ${stepLabel}...`
}

export function buildJobCompleteMessage(job: {
  topic: string
  mode: string
  id: string
  job_outputs?: any[]
}): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
  const outputs = job.job_outputs || []
  const socialPosts = outputs.filter((o: any) => o.metadata?.type === 'social_post').length
  const adVariants = outputs.filter((o: any) => o.metadata?.type === 'ad_copy').length
  const creatives = outputs.filter((o: any) => o.output_type === 'static_creative').length
  const videos = outputs.filter((o: any) => o.output_type === 'social_video').length
  const hasEbook = outputs.some((o: any) => o.output_type === 'flipbook_url')

  let message = `✅ <b>Campaign Complete!</b>\n\n`
  message += `<b>Topic:</b> ${job.topic}\n\n`

  if (hasEbook) message += `📚 Ebook published\n`
  if (socialPosts > 0) message += `📱 ${socialPosts} social posts\n`
  if (adVariants > 0) message += `🎯 ${adVariants} ad variants\n`
  if (creatives > 0) message += `🖼 ${creatives} static creatives\n`
  if (videos > 0) message += `🎬 ${videos} videos\n`

  message += `\n<a href="${baseUrl}/jobs/${job.id}">View Campaign →</a>\n\n`
  message += `Reply with:\n`
  message += `/copy instagram — get Instagram posts\n`
  message += `/copy tiktok — get TikTok posts\n`
  message += `/refine — run content refinement\n`
  message += `/ads — run ad testing loop`

  return message
}

export function buildJobFailedMessage(job: { topic: string; error?: string | null }): string {
  return `❌ <b>Campaign Failed</b>

<b>Topic:</b> ${job.topic}
${job.error ? `\n<b>Error:</b> ${job.error}` : ''}

Reply /run to try again.`
}
