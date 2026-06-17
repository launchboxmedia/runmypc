import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getBusinessAssets, uploadBusinessAsset } from '@/lib/businessFacts'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const businessFactId = searchParams.get('businessFactId')

    const assets = await getBusinessAssets(user.id, {
      status: status || undefined,
      businessFactId: businessFactId || undefined
    })

    return NextResponse.json(assets)
  } catch (error) {
    console.error('Error fetching business assets:', error)
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

    const formData = await request.formData()
    const file = formData.get('file') as File
    const businessFactId = formData.get('businessFactId') as string | null

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    const asset = await uploadBusinessAsset({
      userId: user.id,
      businessFactId: businessFactId || undefined,
      file
    })

    return NextResponse.json(asset)
  } catch (error) {
    console.error('Error uploading business asset:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
