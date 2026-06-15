-- Add loop support to jobs table
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS parent_job_id uuid references jobs(id);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS loop_type text check (loop_type in ('content_refinement', 'ad_testing'));
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS loop_number integer default 0;

-- Add autopilot loop settings to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS autopilot_loops boolean default false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS enabled_loops text[] default array['content_refinement', 'ad_testing'];
