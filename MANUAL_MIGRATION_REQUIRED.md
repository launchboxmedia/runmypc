# Manual Setup Required

## 1. Environment Variables

Add to `.env.local`:
```
SUPABASE_SERVICE_ROLE_KEY=<service_role_key_from_supabase_dashboard>
```

Get from: Supabase Dashboard → Project Settings → API → service_role key

## 2. Database Migrations

Two migrations required. Apply in order via Supabase dashboard → SQL Editor:

**Migration 1 — Loop Columns:**
```
supabase/migrations/20260614000001_add_loop_columns.sql
```

**Migration 2 — Mode Constraint (CRITICAL):**
```
supabase/migrations/20260614000002_update_mode_constraint.sql
```

Without migration 2, job creation fails with check constraint violation.

### What This Adds
- `jobs.parent_job_id` — references parent job for loop jobs
- `jobs.loop_type` — content_refinement | ad_testing
- `jobs.loop_number` — iteration counter
- `profiles.autopilot_loops` — auto-trigger loops on completion
- `profiles.enabled_loops` — which loops user has enabled

## Testing Status

**Without env var:** Job creation fails (500 error)
**Without migration:** Basic job creation works, loop features disabled
**With both:** Full loop functionality enabled
