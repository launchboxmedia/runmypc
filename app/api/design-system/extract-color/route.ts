import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractDominantColor } from '@/lib/designSystem/extractColor'

// POST: returns the dominant color of the caller's most recent APPROVED logo
// asset. Source is deliberately the reviewed asset (business_assets.asset_type =
// 'logo', status = 'approved') — NOT profiles.logo_url, which is not PII-gated.
// Returns { hex: string | null }. Never throws to the client.
export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    const { data: asset } = await admin
      .from('business_assets')
      .select('file_path')
      .eq('user_id', user.id)
      .eq('asset_type', 'logo')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!asset?.file_path) return NextResponse.json({ hex: null })

    const { data: urlData } = await admin.storage
      .from('job-assets')
      .createSignedUrl(asset.file_path, 3600)

    if (!urlData?.signedUrl) return NextResponse.json({ hex: null })

    const res = await fetch(urlData.signedUrl)
    if (!res.ok) return NextResponse.json({ hex: null })
    const buffer = Buffer.from(await res.arrayBuffer())

    const hex = await extractDominantColor(buffer)
    return NextResponse.json({ hex })
  } catch (err) {
    console.error('[extract-color] failed', err)
    return NextResponse.json({ hex: null })
  }
}
