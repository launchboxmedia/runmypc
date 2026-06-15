-- Drop old mode check constraint
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_mode_check;

-- Add new mode check constraint with four-mode system
ALTER TABLE jobs ADD CONSTRAINT jobs_mode_check
  CHECK (mode IN ('full_run', 'ebook_only', 'content_only', 'ads_only'));
