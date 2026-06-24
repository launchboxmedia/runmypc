'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import BusinessFactsManager from '@/components/BusinessFactsManager'
import { StylePicker } from '@/components/StylePicker'
import type { StyleId } from '@/lib/designSystem/styleLibrary'

type Profile = {
  id: string
  email: string
  full_name: string | null
  business_name: string | null
  website_url: string | null
  industry: string | null
  brand_tone: string | null
  brand_voice_examples: string | null
  words_to_use: string | null
  words_to_avoid: string | null
  logo_url: string | null
  brand_colors: string | null
  style_id: string | null
  primary_color: string | null
  split_image_cover: boolean
  profile_photo_url: string | null
  instagram_handle: string | null
  tiktok_handle: string | null
  youtube_handle: string | null
  linkedin_url: string | null
  audience_description: string | null
  audience_pain_point: string | null
  audience_outcome: string | null
  flipbookpro_api_key: string | null
  telegram_chat_id: string | null
  webhook_url: string | null
  research_instagram_usernames: string | null
  cta_objective: string | null
  brand_niche: string | null
}

const TONE_OPTIONS = [
  'Conversational',
  'Authoritative',
  'Inspirational',
  'Educational',
  'Practical',
  'Bold',
  'Friendly'
]

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [logoSignedUrl, setLogoSignedUrl] = useState<string | null>(null)
  const [photoSignedUrl, setPhotoSignedUrl] = useState<string | null>(null)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (data) {
        setProfile(data)

        // Regenerate signed URLs from stored URLs
        if (data.logo_url) {
          const path = data.logo_url.split('/job-assets/')[1]
          if (path) {
            const { data: signedData } = await supabase.storage
              .from('job-assets')
              .createSignedUrl(path, 3600)
            if (signedData?.signedUrl) setLogoSignedUrl(signedData.signedUrl)
          }
          // Backfill: ensure an existing logo is a selectable approved asset.
          fetch('/api/design-system/sync-logo', { method: 'POST' }).catch(() => {})
        }

        if (data.profile_photo_url) {
          const path = data.profile_photo_url.split('/job-assets/')[1]
          if (path) {
            const { data: signedData } = await supabase.storage
              .from('job-assets')
              .createSignedUrl(path, 3600)
            if (signedData?.signedUrl) setPhotoSignedUrl(signedData.signedUrl)
          }
        }
      }
    }
    loadProfile()
  }, [])

  // Pre-fill the primary color from the customer's approved logo when none set.
  useEffect(() => {
    if (!profile || profile.primary_color) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/design-system/extract-color', { method: 'POST' })
        const { hex } = await res.json()
        if (!cancelled && hex) update('primary_color', hex)
      } catch { /* leave picker empty */ }
    })()
    return () => { cancelled = true }
  }, [profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (!profile) return
    setSaving(true)

    // Upload logo if selected
    if (logoFile) {
      const { data } = await supabase.storage
        .from('job-assets')
        .upload(`${profile.id}/brand/logo-${Date.now()}.png`, logoFile, {
          contentType: logoFile.type,
          upsert: true
        })
      if (data) {
        const { data: urlData } = await supabase.storage
          .from('job-assets')
          .createSignedUrl(data.path, 31536000) // 1 year
        profile.logo_url = urlData?.signedUrl || null
      }
    }

    // Upload profile photo if selected
    if (photoFile) {
      const { data } = await supabase.storage
        .from('job-assets')
        .upload(`${profile.id}/brand/photo-${Date.now()}.png`, photoFile, {
          contentType: photoFile.type,
          upsert: true
        })
      if (data) {
        const { data: urlData } = await supabase.storage
          .from('job-assets')
          .createSignedUrl(data.path, 31536000) // 1 year
        profile.profile_photo_url = urlData?.signedUrl || null
      }
    }

    await supabase
      .from('profiles')
      .update({
        full_name: profile.full_name,
        business_name: profile.business_name,
        website_url: profile.website_url,
        industry: profile.industry,
        brand_tone: profile.brand_tone,
        brand_voice_examples: profile.brand_voice_examples,
        words_to_use: profile.words_to_use,
        words_to_avoid: profile.words_to_avoid,
        logo_url: profile.logo_url,
        brand_colors: profile.brand_colors,
        style_id: profile.style_id,
        primary_color: profile.primary_color,
        split_image_cover: profile.split_image_cover,
        profile_photo_url: profile.profile_photo_url,
        instagram_handle: profile.instagram_handle,
        tiktok_handle: profile.tiktok_handle,
        youtube_handle: profile.youtube_handle,
        linkedin_url: profile.linkedin_url,
        audience_description: profile.audience_description,
        audience_pain_point: profile.audience_pain_point,
        audience_outcome: profile.audience_outcome,
        flipbookpro_api_key: profile.flipbookpro_api_key,
        telegram_chat_id: profile.telegram_chat_id,
        webhook_url: profile.webhook_url,
        research_instagram_usernames: profile.research_instagram_usernames,
        cta_objective: profile.cta_objective,
        brand_niche: profile.brand_niche,
      })
      .eq('id', profile.id)

    // Materialize the logo as a selectable, approved business asset (idempotent).
    fetch('/api/design-system/sync-logo', { method: 'POST' }).catch(() => {})

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function update(field: keyof Profile, value: string) {
    setProfile(prev => prev ? { ...prev, [field]: value } : prev)
  }

  if (!profile) return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center">
      <p className="text-gray-400">Loading...</p>
    </main>
  )

  return (
    <main className="min-h-screen bg-black text-white p-8">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div className="border-t-2 border-b-2 border-[#E8622A] px-4 py-2">
            <span className="text-xl font-black">RUN MY PC</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-gray-500 hover:text-white text-sm">← Jobs</Link>
            <button
              onClick={handleSignOut}
              className="text-gray-500 hover:text-white text-sm"
            >
              Sign Out
            </button>
          </div>
        </div>

        <h2 className="text-2xl font-black mb-8">Profile & Brand</h2>

        {/* Section — Identity */}
        <Section title="Identity">
          <Field label="Full Name">
            <Input value={profile.full_name || ''} onChange={v => update('full_name', v)} placeholder="Your name" />
          </Field>
          <Field label="Business Name">
            <Input value={profile.business_name || ''} onChange={v => update('business_name', v)} placeholder="Your business" />
          </Field>
          <Field label="Website">
            <Input value={profile.website_url || ''} onChange={v => update('website_url', v)} placeholder="https://yourbusiness.com" />
          </Field>
          <Field label="Industry">
            <Input value={profile.industry || ''} onChange={v => update('industry', v)} placeholder="e.g. Business Funding, Digital Products, Coaching" />
          </Field>
        </Section>

        {/* Section — Brand Voice */}
        <Section title="Brand Voice">
          <Field label="Tone">
            <select
              value={profile.brand_tone || ''}
              onChange={e => update('brand_tone', e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-[#E8622A]"
            >
              <option value="">Select tone...</option>
              {TONE_OPTIONS.map(t => (
                <option key={t} value={t.toLowerCase()}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Writing style examples" hint="Paste 2-3 sample posts so agents can mirror your voice">
            <Textarea value={profile.brand_voice_examples || ''} onChange={v => update('brand_voice_examples', v)} placeholder="Paste examples of your best performing posts..." rows={4} />
          </Field>
          <Field label="Words/phrases to always use">
            <Input value={profile.words_to_use || ''} onChange={v => update('words_to_use', v)} placeholder="e.g. founder, capital, funding strategy" />
          </Field>
          <Field label="Words/phrases to never use">
            <Input value={profile.words_to_avoid || ''} onChange={v => update('words_to_avoid', v)} placeholder="e.g. hustle, grind, passive income" />
          </Field>
        </Section>

        {/* Section — Visual Assets */}
        <Section title="Visual Assets">
          <Field label="Logo">
            <div className="flex items-center gap-4">
              {logoSignedUrl && (
                <img src={logoSignedUrl} alt="Logo" className="w-16 h-16 object-contain bg-gray-900 rounded-lg p-2" />
              )}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={e => setLogoFile(e.target.files?.[0] || null)}
                className="text-sm text-gray-400"
              />
            </div>
          </Field>
          <Field label="Profile Photo">
            <div className="flex items-center gap-4">
              {photoSignedUrl && (
                <img src={photoSignedUrl} alt="Photo" className="w-16 h-16 object-cover rounded-full" />
              )}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={e => setPhotoFile(e.target.files?.[0] || null)}
                className="text-sm text-gray-400"
              />
            </div>
          </Field>
          <Field label="Brand Colors" hint="Hex codes separated by commas">
            <Input value={profile.brand_colors || ''} onChange={v => update('brand_colors', v)} placeholder="#E8622A, #000000, #FFFFFF" />
          </Field>
        </Section>

        {/* Section — Global Defaults */}
        <Section title="Global Defaults">
          <Field label="Default CTA Objective" hint="Pre-fills the run screen. Override per job.">
            <select
              value={profile.cta_objective || ''}
              onChange={e => update('cta_objective', e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 p-3 text-white focus:outline-none focus:border-[#E8622A]"
              style={{ borderRadius: 0 }}
            >
              <option value="">— select —</option>
              <option value="audience_growth">Audience Growth</option>
              <option value="drive_traffic">Drive Traffic</option>
              <option value="engagement">Engagement</option>
              <option value="automation">Automation (Manychat)</option>
            </select>
          </Field>
          <Field label="Brand Niche" hint="Your market category — used to sharpen copy tone and cover visuals">
            <Input
              value={profile.brand_niche || ''}
              onChange={v => update('brand_niche', v)}
              placeholder="e.g. Credit Repair, Real Estate Investing, E-commerce"
            />
          </Field>
        </Section>

        {/* Section — Carousel Design */}
        <Section title="Carousel Design">
          <Field label="Style" hint="Pick the design system for your carousels">
            <StylePicker
              value={(profile.style_id as StyleId) || null}
              onChange={id => update('style_id', id)}
            />
          </Field>
          <Field label="Primary Color" hint="Optional — auto-filled from your logo. Accent & background are derived from this.">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={profile.primary_color || '#111827'}
                onChange={e => update('primary_color', e.target.value)}
                className="h-11 w-14 rounded-lg border border-gray-700 bg-gray-900 p-1 cursor-pointer"
              />
              <Input
                value={profile.primary_color || ''}
                onChange={v => update('primary_color', v)}
                placeholder="#2563EB"
              />
            </div>
          </Field>
          <Field label="Split-image cover" hint="One image spans the first two slides">
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={!!profile.split_image_cover}
                onChange={e => setProfile(prev => prev ? { ...prev, split_image_cover: e.target.checked } : prev)}
              />
              Enable split-image cover
            </label>
          </Field>
        </Section>

        {/* Section — Social Handles */}
        <Section title="Social Handles">
          <Field label="Instagram">
            <Input value={profile.instagram_handle || ''} onChange={v => update('instagram_handle', v)} placeholder="@yourhandle" />
          </Field>
          <Field label="TikTok">
            <Input value={profile.tiktok_handle || ''} onChange={v => update('tiktok_handle', v)} placeholder="@yourhandle" />
          </Field>
          <Field label="YouTube">
            <Input value={profile.youtube_handle || ''} onChange={v => update('youtube_handle', v)} placeholder="@yourchannel" />
          </Field>
          <Field label="LinkedIn">
            <Input value={profile.linkedin_url || ''} onChange={v => update('linkedin_url', v)} placeholder="https://linkedin.com/in/yourprofile" />
          </Field>
          <Field label="Research Instagram Usernames" hint="Influencers/competitors to scrape for content research (comma-separated)">
            <Input value={profile.research_instagram_usernames || ''} onChange={v => update('research_instagram_usernames', v)} placeholder="@influencer1, @influencer2, @competitor" />
          </Field>
        </Section>

        {/* Section — Your Audience */}
        <Section title="Your Audience">
          <Field label="Who are you trying to reach?">
            <Textarea value={profile.audience_description || ''} onChange={v => update('audience_description', v)} placeholder="e.g. New entrepreneurs who need startup capital but have no credit history" rows={2} />
          </Field>
          <Field label="What's their biggest pain point?">
            <Textarea value={profile.audience_pain_point || ''} onChange={v => update('audience_pain_point', v)} placeholder="e.g. They can't get business loans because they have no revenue history" rows={2} />
          </Field>
          <Field label="What transformation do you deliver?">
            <Textarea value={profile.audience_outcome || ''} onChange={v => update('audience_outcome', v)} placeholder="e.g. They learn how to use 0% business credit cards to fund their startup" rows={2} />
          </Field>
        </Section>

        {/* Section — Business Facts & Assets */}
        <Section title="Business Facts & Assets">
          <BusinessFactsManager />
        </Section>

        {/* Section — Integrations */}
        <Section title="Integrations">
          <Field label="FlipBookPro API Key">
            <Input
              value={profile.flipbookpro_api_key || ''}
              onChange={v => update('flipbookpro_api_key', v)}
              placeholder="fbp_..."
              type="password"
            />
          </Field>
          <Field label="Telegram Chat ID" hint="Get this by messaging @userinfobot on Telegram">
            <Input value={profile.telegram_chat_id || ''} onChange={v => update('telegram_chat_id', v)} placeholder="Your Telegram chat ID" />
          </Field>
          <Field label="Webhook URL" hint="Receives a POST request when your job completes">
            <Input value={profile.webhook_url || ''} onChange={v => update('webhook_url', v)} placeholder="https://hooks.zapier.com/..." />
          </Field>
        </Section>

        {/* Save Button */}
        <div className="mt-8 flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-8 py-3 bg-[#E8622A] hover:bg-[#d4551f] disabled:opacity-50 text-white font-black rounded-lg uppercase tracking-widest"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
          {saved && <span className="text-green-400 text-sm">✓ Saved</span>}
        </div>

      </div>
    </main>
  )
}

// Helper components
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-10">
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 border-b border-gray-800 pb-2">
        {title}
      </h3>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
      {hint && <p className="text-xs text-gray-600 mb-2">{hint}</p>}
      {children}
    </div>
  )
}

function Input({ value, onChange, placeholder, type = 'text' }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#E8622A]"
    />
  )
}

function Textarea({ value, onChange, placeholder, rows = 3 }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#E8622A] resize-none"
    />
  )
}
