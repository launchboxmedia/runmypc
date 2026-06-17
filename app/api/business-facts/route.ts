import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getBusinessFacts, createBusinessFact } from '@/lib/businessFacts'
import type { BusinessFactType } from '@/types/business'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') as BusinessFactType | null
    const serviceTag = searchParams.get('serviceTag')

    const facts = await getBusinessFacts(user.id, {
      type: type || undefined,
      serviceTag: serviceTag || undefined
    })

    return NextResponse.json(facts)
  } catch (error) {
    console.error('Error fetching business facts:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { type, content, serviceTag } = body

    if (!type || !content) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const fact = await createBusinessFact({
      userId: user.id,
      type,
      content,
      serviceTag
    })

    return NextResponse.json(fact)
  } catch (error) {
    console.error('Error creating business fact:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
