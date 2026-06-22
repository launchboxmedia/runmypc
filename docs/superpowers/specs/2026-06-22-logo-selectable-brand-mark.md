# Logo — Selectable Asset + Deliberate Brand Mark

**Date:** 2026-06-22
**Status:** Approved (autonomous build authorized by user)
**Branch:** `logo-brand-mark`

## Problem

The brand logo lives only in `profiles.logo_url` (profile page → "Visual Assets").
The job asset picker (`app/page.tsx`) lists only **approved `business_assets`** rows,
so the logo can't be selected for a job, and nothing ever places it as a brand mark.
(Today the logo is read once, by the extract-color route, for color only.)

## Goal

1. **Make the logo a selectable asset** — surface it in the existing job picker by
   materializing the profile logo as an approved `business_assets` row
   (`asset_type='logo'`). No picker/jobs-API changes needed (they already handle
   approved business_assets + the `job_selected_assets` FK join).
2. **Deliberately place the selected logo** as a small, consistent brand mark on every
   carousel slide — composited via the static-render HTML (reliable; data-URI embedded
   because the render lambda has no network egress).

## Non-goals

- Statics (GPT-Image-2) / cinematic (Seedance): image/video models can't be forced to
  composite a precise logo — out of scope. Carousel is the HTML-composited output where
  deterministic placement is reliable.
- Fixing `profiles.logo_url` storing a signed URL (works via re-sign on load; untouched).

## Schema facts (verified)

`business_assets`: `user_id` + `file_path` NOT NULL; `file_type` default `'image'`;
`status` ∈ {pending_review, approved, rejected}; `asset_type` ∈ {logo, profile_photo,
mascot, ai_avatar, product_image, social_proof}; `usable_in` default `'both'`.
`job_selected_assets.asset_id` → FK `business_assets.id`. Picker filters `status='approved'`.

## Changes

### 1. `app/api/design-system/sync-logo/route.ts` (new, POST, authed)

Materializes the caller's profile logo as an approved logo asset. Idempotent.

- Auth via session (`createClient().auth.getUser()`); 401 if none.
- Admin client reads `profiles.logo_url` for the user. If null → `{ ok: true, assetId: null }`.
- Derive the storage path: take the substring after `/job-assets/`, strip any `?query`
  (the stored value is a signed URL containing the path; expired tokens don't matter —
  only the path is used).
- Upsert: if a `business_assets` row with `user_id` + `asset_type='logo'` exists, update
  its `file_path` (+ ensure `status='approved'`, `usable_in='both'`); else insert
  `{ user_id, asset_type:'logo', file_path, file_type:'image', usable_in:'both', status:'approved' }`.
- Return `{ ok: true, assetId }`. Never throws to client (logs + `{ ok:false }` on error).

The logo is the user's own brand mark (not scraped) → auto-approved is correct and
matches what extract-color already expects.

### 2. `app/profile/page.tsx`

- After a successful `handleSave` (whether or not a new logo was just uploaded), call
  `fetch('/api/design-system/sync-logo', { method:'POST' })`. Best-effort (ignore errors).
- On profile load, if `logo_url` is set, fire the same call once (idempotent) so
  **existing** logos become selectable without a migration.

### 3. `lib/workflows/content-generation.ts` Step 4 — separate logo from cover asset

In the carousel step, from the job's `selectedAssets`:

- `logoAsset = selectedAssets.find(a => a.asset_type === 'logo')`. If present, sign +
  fetch its bytes → `logoDataUri` (base64). Passed to `generateCarousel` as the brand mark.
- `coverAsset = selectedAssets.find(a => a.file_type?.startsWith('image') && a.asset_type !== 'logo')`
  — the cover hero visual now **excludes** the logo (a logo must never become the cover
  background). Existing `selectedAssetUrl` logic, minus logos.

### 4. `lib/carousel/generateCarousel.ts`

- New optional input `logoDataUri?: string | null`.
- Thread it into every slide render (`renderSlideWithGate(..., logoDataUri)`), for both
  the cover and body slides.

### 5. `lib/carousel/slideHtml.ts` — deterministic logo stamp

- `generateSlideHtml` gains `logoDataUri?: string | null`.
- When present:
  - **Prompt note:** "A brand logo will be placed in the TOP-LEFT corner (~210×100px).
    Keep that corner clear — no text or key elements there." (so Haiku doesn't collide).
  - **Deterministic inject** (not Haiku-dependent): after HTML assembly, append before
    `</body>` (or at end if no body tag) a fixed brand-mark element:
    ```html
    <img src="<logoDataUri>" alt="" style="position:fixed;top:44px;left:44px;height:60px;width:auto;max-width:200px;object-fit:contain;z-index:2147483647;pointer-events:none;" />
    ```
- New pure helper `stampLogo(html, logoDataUri): string` (exported, unit-tested):
  injects the mark before the last `</body>`; if none, appends to the string.

## Files

- **Create** `app/api/design-system/sync-logo/route.ts`.
- **Modify** `app/profile/page.tsx` (call sync-logo on save + on load).
- **Modify** `lib/workflows/content-generation.ts` (Step 4 logo/cover split + logoDataUri).
- **Modify** `lib/carousel/generateCarousel.ts` (thread `logoDataUri`).
- **Modify** `lib/carousel/slideHtml.ts` (`stampLogo` + prompt note) + `slideHtml`/helpers test.

## Error handling

- sync-logo: no logo / fetch failure → `{ ok:false|true, assetId:null }`, never blocks save.
- Step 4: logo fetch failure → `logoDataUri = null` (carousel renders without the mark).
- `stampLogo` with null/empty → returns HTML unchanged.
- Logo on a dark slide where the logo is dark is the customer's own asset (no auto-contrast
  chip in v1 — possible follow-up).

## Testing / verification

- **Unit (`helpers.test.ts`):** `stampLogo` injects the img before `</body>`; appends when
  no body tag; returns input unchanged for null/empty data-URI; only one mark injected.
- `npx tsc --noEmit` clean; full unit suite green.
- **Live:** render a carousel passing a real `logoDataUri`; Read a slide and confirm the
  logo appears top-left, correctly sized, not clobbering content.
- **Manual (post-deploy):** upload a logo in profile → it appears as a selectable "logo"
  asset in the job picker; selecting it stamps it on the carousel.

## Out of scope

- Logo on statics/cinematic; auto-contrast backing chip; multi-logo; logo position options.
