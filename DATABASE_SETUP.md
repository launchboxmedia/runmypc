# Database Setup

## Problem
Signup fails with "Database error saving new user" because database schema doesn't exist yet.

## Solution

### 1. Get Service Role Key

Go to: https://supabase.com/dashboard/project/limscrtqcpequuzgmpde/settings/api

Copy the **service_role** key (starts with `eyJ...`)

### 2. Add to .env.local

```bash
SUPABASE_SERVICE_ROLE_KEY=<paste-key-here>
```

### 3. Apply Migrations

```bash
# Install Supabase CLI if not installed
npm install -g supabase

# Link to project (may need access token from dashboard)
npx supabase link --project-ref limscrtqcpequuzgmpde

# Push migrations to remote database
npx supabase db push
```

### 4. Test Signup

Go to http://localhost:3000/signup and create account with:
- Email: launchboxmedia2025@gmail.com  
- Password: (your choice)
- Full Name: (your choice)

Should succeed and redirect to home page.

## What the Migration Does

Creates:
- `profiles` table (user data, brand info, settings)
- `jobs` table (job tracking)
- `job_steps` table (step tracking)
- RLS policies (row-level security)
- Auto-create profile trigger on signup
- Indexes for performance

File: `supabase/migrations/20260615000000_initial_schema.sql`
