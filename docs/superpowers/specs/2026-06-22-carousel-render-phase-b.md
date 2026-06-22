# Carousel Render — Phase B Spec + Plan

**Date:** 2026-06-22
**Repo:** `C:\Users\mjohn\Documents\LaunchBox.Media\hyperframes-render` (separate Vercel project `hyperframes-render`, ref linked, authed `launchboxmedia`). Baseline `bd6994d` (live prod).
**Approach:** Option C — static frames rendered in the Next serverless lambda via headless Chromium (`@sparticuz/chromium` + `puppeteer-core`). The animated MP4 sandbox path is untouched.

## Goal
Add a `render_mode: "static" | "animated"` parameter to the render service. `static` renders posted HTML to a single PNG at a fixed viewport (default 4:5, 1080×1350) with bundled fonts, returns `{ url }` (PNG on Vercel Blob). `animated` (default, back-compat) = the existing sandbox MP4 path, unchanged.

## Why lambda, not sandbox
Carousel stills are produced at volume (cover + ~5 body slides × many jobs). Per-still microVM spin-up is the wrong cost/latency curve. Lambda Chromium screenshots are fast, cheap, and keep the animated path fully isolated. Bundled fonts load deterministically with no network (sandbox/lambda may have no egress).

## Contract
`POST {HYPERFRAMES_RENDER_URL}` (same endpoint, `/api/render`):
```jsonc
// animated (unchanged; render_mode omitted or "animated")
{ "html": "...", "width": 1080, "height": 1920, "fps": 30, "durationInSeconds": 12 }
// static (new)
{ "render_mode": "static", "html": "...", "width": 1080, "height": 1350 }
```
Response (both): `{ "url": "https://...blob..." }` — `.mp4` for animated, `.png` for static. Errors: `{ "error": "..." }` non-200.

## Files (hyperframes-render repo)
- Modify `app/api/render/route.ts` — branch on `render_mode`. Default/animated → existing `renderInSandbox` path (unchanged). `static` → `renderStaticPng` + PNG blob put.
- Create `lib/staticRender.ts` — `renderStaticPng({ html, width, height }): Promise<Buffer>`. Launches `@sparticuz/chromium` via `puppeteer-core`, injects the bundled-font stylesheet, `setContent(html, { waitUntil: 'networkidle0' })`, `await page.evaluate(() => document.fonts.ready)`, `page.screenshot({ type: 'png' })`. Viewport = width×height, `deviceScaleFactor: 2` for crisp text.
- Create `lib/fonts.ts` — reads bundled font files at module load, builds one `@font-face` CSS block per family/weight as base64 `data:` URIs (no network). Exports `FONT_FACE_CSS: string`. Family names EXACTLY match `styleLibrary.typography` in runmypc: `Anton`, `Montserrat`, `Inter`, `Fredoka`, `Kalam`, `Archivo`, `Playfair Display`.
- Create `fonts/` — bundled `.woff2` files (Google Fonts, OFL):
  - Anton 400; Montserrat 600/700; Inter 400/700 + 400 italic; Fredoka 600; Kalam 400/700; Archivo 800; Playfair Display 700 + 700 italic.
- Add deps: `@sparticuz/chromium`, `puppeteer-core` (matched major versions).

## Font loading detail
`renderStaticPng` injects `FONT_FACE_CSS` into the page `<head>` before paint (via `page.addStyleTag({ content: FONT_FACE_CSS })` after `setContent`, then await `document.fonts.ready`). Agent HTML (Phase C) only needs `font-family: 'Anton'` etc. — declarations are provided by the service. Base64 data-URIs guarantee load with zero network egress; a failed CDN fetch silently falling back to a system font is impossible.

## Verification (REQUIRED — view actual pixels, not API success)
1. `npx tsc --noEmit` (repo uses `typecheck` script) clean.
2. Local: a script renders ONE test slide per style (5), each using that style's display + body family at a large size on a contrasting background. Save 5 PNGs. **Read each PNG and visually confirm the intended font shape renders — not a generic sans fallback** (e.g. Anton = tall condensed caps; Playfair = high-contrast serif; Kalam = handwritten). If any looks like fallback Arial/Helvetica, the bundle/`@font-face` is wrong — fix before deploy.
3. Deploy: `vercel deploy --prod` from the repo (authed). 
4. Live: POST a `render_mode:"static"` request to the prod `/api/render`; confirm a PNG URL returns and the image is correct (Read it).
5. Regression: POST one `animated` request (render_mode omitted) → confirm MP4 still returns (animated path intact).

## Out of scope
Cover/body HTML generation, vision scoring, quality gate, storage into job-assets, dashboard — all Phase C. Phase B only makes the renderer produce a correct PNG from posted HTML with correct fonts.

## Task list (inline execution)
1. Add deps (`@sparticuz/chromium`, `puppeteer-core`); confirm versions compatible.
2. Acquire + commit the font `.woff2` files into `fonts/`.
3. `lib/fonts.ts` — build `FONT_FACE_CSS` from bundled files (base64). tsc.
4. `lib/staticRender.ts` — `renderStaticPng`. tsc.
5. `route.ts` — `render_mode` branch (animated default unchanged). tsc.
6. Local font-verification harness → render 5 per-style PNGs → view → confirm real fonts.
7. `vercel deploy --prod`; live static POST + view PNG; live animated POST regression.
8. Commit; record live status; hand off to Phase C.
