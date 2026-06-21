# Hyperframes Render Service (separate Vercel project)

RunMyPC's Step 5 (social videos) POSTs an LLM-generated HTML composition to a
render service and expects an MP4 URL back. That service is **a separate Vercel
project** based on the Hyperframes template, deployed independently from RunMyPC.

This folder is **deploy reference only** — it is not part of the RunMyPC build
(`route.ts.example` is intentionally not a `.ts` file so `tsc` ignores it).

## Contract RunMyPC expects

`POST {HYPERFRAMES_RENDER_URL}`

Request body (JSON):
```json
{
  "html": "<!DOCTYPE html>...full self-contained composition...",
  "width": 1080,
  "height": 1920,
  "fps": 30,
  "durationInSeconds": 12
}
```

Response (JSON):
```json
{ "url": "https://...vercel-blob.../render.mp4" }
```

On error, return `{ "error": "message" }` with a non-200 status.

The stock template's `POST /api/render` renders a **fixed** composition from
`PREVIEW_COMPOSITION_DIR` and ignores the request body. RunMyPC needs it to
render the **posted** HTML instead. Replace the stock `app/api/render/route.ts`
with `route.ts.example` from this folder (rename to `route.ts`).

## Deploy steps (requires your Vercel auth — not automatable from RunMyPC)

1. Clone the template into its own repo:
   ```
   git clone https://github.com/heygen-com/hyperframes-vercel-template hyperframes-render
   cd hyperframes-render
   ```
2. Replace `app/api/render/route.ts` with this folder's `route.ts.example`
   (renamed to `route.ts`).
3. Deploy as a **new** Vercel project:
   ```
   vercel deploy --prod
   ```
   - Vercel injects `BLOB_READ_WRITE_TOKEN` automatically (enable Vercel Blob).
   - Sandbox auth uses `VERCEL_OIDC_TOKEN` at runtime (handled by Vercel).
4. Copy the deployed URL of the render endpoint, e.g.
   `https://hyperframes-render.vercel.app/api/render`.
5. Set it in RunMyPC:
   - `.env.local`: `HYPERFRAMES_RENDER_URL=https://hyperframes-render.vercel.app/api/render`
   - Vercel (RunMyPC project) env var: same.
6. Redeploy RunMyPC. Until this is set, Step 5 cleanly **skips** (jobs do not fail).

## Verify duration handling

The template's `renderInSandbox(files)` derives recording duration from the
composition. Confirm how (composition manifest vs. data attributes vs. fixed
default) and ensure ~12s is honored. If a manifest file is required, the example
route shows where to add it (`composition.json`). Compositions written by RunMyPC
encode their own timing via CSS `@keyframes` / `animation-delay`.
