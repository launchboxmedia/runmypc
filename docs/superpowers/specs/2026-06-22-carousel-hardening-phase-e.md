# Carousel Cost/Latency Hardening — Phase E Spec

**Date:** 2026-06-22
**Status:** Approved (autonomous build authorized by user)
**Branch:** `carousel-phase-e`

## Context

Phase C's `generateCarousel` renders slides in a **sequential** for-loop:
each slide does Haiku-HTML → lambda render → Haiku-vision gate (×up to 2 retries).
For ~5 slides that serializes ~60–75s of mostly-independent work. Additional waste:
`renderStaticPng` has no timeout (a stuck lambda hangs the whole job), and the
quality gate is called even on the final retry whose result is kept regardless.

## Goal

Cut carousel latency and bounded-cost **without changing output quality**:
parallelize independent slide work with a concurrency cap, overlap the slow cover
visual generation with body-slide rendering, add a render timeout, and skip the
wasted final-attempt gate call. Cover variant count becomes a single tunable constant.

No change to: slide plan, per-slide HTML/quality semantics, the 2-retry cap, the
`job_outputs` schema, or the dashboard.

## Changes

### 1. `lib/carousel/concurrency.ts` (new, pure)

```ts
// Run an async mapper over items with a bounded number in flight at once.
// Preserves input order in the results.
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]>
```

Worker-pool implementation: at most `limit` promises in flight; results written
back at each item's original index. `limit <= 0` is treated as 1.

### 2. `lib/carousel/renderClient.ts` — timeout

Add an abortable timeout so a stuck render fails fast instead of hanging the job.

```ts
export async function renderStaticPng(html: string, width=1080, height=1350, timeoutMs=60000): Promise<Buffer>
```

Use `AbortSignal.timeout(timeoutMs)` on both the render POST and the PNG fetch.
On abort, throw a clear `Static render timed out after <ms>ms` error (caller's
Step 4 try/catch already marks the step failed).

### 3. `lib/carousel/generateCarousel.ts` — parallelize + overlap

- Start cover-visual resolution **without awaiting**.
- Render **body slides** (index ≥ 1; they do not need the cover visual) via
  `mapWithConcurrency(bodySlides, SLIDE_CONCURRENCY, …)`.
- Render the **cover slide** as its own promise that awaits the cover visual first.
- `await Promise.all([coverPromise, bodyPromise])`, then assemble results ordered
  by slide index (cover first, CTA last).
- `SLIDE_CONCURRENCY` constant = 4 (bounds concurrent Haiku + render calls against
  rate limits while still collapsing most of the serial latency).
- Net latency ≈ `max(coverVisualTime + coverRenderTime, bodyRenderTime)` instead of
  the sum of all slides.

### 4. `renderSlideWithGate` — skip the wasted final gate

On the last allowed attempt (`attempt === MAX_RETRIES`) the result is kept no matter
what, so do **not** call `checkSlide` on that attempt. Saves one Haiku-vision call per
slide that exhausts retries. Behavior otherwise identical (earlier attempts still gate
and retry on failure).

### 5. Cover variant count constant

In `coverVisual.ts`, extract the hard-coded `2` generated variants into a
`COVER_VARIANTS` constant (default 2) so the image-gen cost — the dominant dollar
cost — is tunable in one place. No behavior change at the default.

## Files

- **Create** `lib/carousel/concurrency.ts` + `concurrency.test.ts`.
- **Modify** `lib/carousel/renderClient.ts` (timeout).
- **Modify** `lib/carousel/generateCarousel.ts` (parallel/overlap, skip final gate).
- **Modify** `lib/carousel/coverVisual.ts` (`COVER_VARIANTS` constant).

## Error handling

- A single slide that still fails the gate after retries is kept (unchanged).
- A hard render/timeout error in any slide rejects its promise → `Promise.all`
  rejects → propagates to Step 4's try/catch → step marked failed (unchanged
  semantics; now it can also be a timeout instead of an indefinite hang).
- `mapWithConcurrency` propagates the first rejection (fail-fast), matching the
  current sequential loop's behavior.

## Testing / verification

- **Unit (`concurrency.test.ts`):**
  1. results preserve input order regardless of completion order.
  2. never more than `limit` in flight (track a live counter, assert max).
  3. `limit <= 0` behaves as serial (1 at a time), still correct.
  4. a rejecting item rejects the whole call.
- `npx tsc --noEmit` clean; full unit suite green.
- **Live:** re-run the Phase C carousel harness for one style; confirm the slides
  still render correctly (Read pixels) and note wall-clock is materially lower than
  the prior ~60–75s sequential baseline.

## Out of scope

- Reducing output quality (fewer variants by default, dropping the body gate,
  lower resolution) — explicitly NOT done.
- Caching (carousels are per-job unique — no reuse value).
- Render-service changes (Phase B owns the lambda).
