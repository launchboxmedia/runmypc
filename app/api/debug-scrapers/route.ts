import { NextResponse } from 'next/server'
import { debugScraperResults } from '@/lib/workflows/content-generation-debug'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET() {
  try {
    const results = await debugScraperResults()
    return NextResponse.json(results)
  } catch (error) {
    console.error('Debug scraper route error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
