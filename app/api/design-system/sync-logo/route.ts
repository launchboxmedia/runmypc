import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Materializes the caller's profile logo (profiles.logo_url, uploaded under
// "Visual Assets") as an APPROVED business_assets row (asset_type='logo'), so it
// becomes selectable in the job asset picker and placeable as a brand mark.
// Idempotent — updates the existing logo asset's path or inserts a new one.
// The logo is the user's own brand mark (not scraped), so auto-approval is correct.
export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('logo_url')
      .eq('id', user.id)
      .single()

    if (!profile?.logo_url) return NextResponse.json({ ok: true, assetId: null })

    // logo_url is a signed URL containing the storage path; only the path matters.
    const after = profile.logo_url.split('/job-assets/')[1]
    const filePath = after ? after.split('?')[0] : null
    if (!filePath) return NextResponse.json({ ok: true, assetId: null })

    const { data: existing } = await admin
      .from('business_assets')
      .select('id')
      .eq('user_id', user.id)
      .eq('asset_type', 'logo')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existing?.id) {
      await admin
        .from('business_assets')
        .update({ file_path: filePath, status: 'approved', usable_in: 'both' })
        .eq('id', existing.id)
      return NextResponse.json({ ok: true, assetId: existing.id })
    }

    const { data: inserted } = await admin
      .from('business_assets')
      .insert({
        user_id: user.id,
        asset_type: 'logo',
        file_path: filePath,
        file_type: 'image',
        usable_in: 'both',
        status: 'approved',
      })
      .select('id')
      .single()

    return NextResponse.json({ ok: true, assetId: inserted?.id ?? null })
  } catch (err) {
    console.error('[sync-logo] failed', err)
    return NextResponse.json({ ok: false, assetId: null })
  }
}
