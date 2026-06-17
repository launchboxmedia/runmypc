-- Add service_tag to jobs table for business facts filtering
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS service_tag TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_service_tag ON jobs(service_tag);
