import { NextResponse } from 'next/server'

export async function POST() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  if (!botToken || !appUrl) {
    return NextResponse.json({ error: 'Missing configuration' }, { status: 500 })
  }

  const webhookUrl = `${appUrl}/api/telegram/webhook`

  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/setWebhook`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl })
    }
  )

  const result = await res.json()
  return NextResponse.json(result)
}
