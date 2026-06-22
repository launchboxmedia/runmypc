import { createAdminClient } from '@/lib/supabase/admin'
import type { ResolvedDesignSystem } from './resolveDesignSystem'

// The ONLY function that persists a resolved/inferred design system. It writes
// the `jobs` table ONLY and must NEVER write `profiles`.
//
// FOOTGUN GUARD: inferred styles are job-scoped. If a future "save this as my
// default" convenience is added, it MUST originate from an explicit user action
// that writes `profiles` directly — it must NOT reuse this path or call this
// function against the profile. Do not add a profiles write here.
export async function persistJobStyle(jobId: string, resolved: ResolvedDesignSystem): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('jobs')
    .update({
      style_id: resolved.style_id,
      primary_color: resolved.primary_color,
      split_image_cover: resolved.split_image_cover,
    })
    .eq('id', jobId)
  if (error) throw error
}
