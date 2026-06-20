-- Add asset_type enum to business_assets
ALTER TABLE business_assets
ADD COLUMN IF NOT EXISTS asset_type TEXT
CHECK (asset_type IN ('logo', 'profile_photo', 'mascot', 'ai_avatar', 'product_image', 'social_proof'));

-- Index for filtering by asset_type
CREATE INDEX IF NOT EXISTS idx_business_assets_type ON business_assets(asset_type);

-- Create job-asset selection join table
CREATE TABLE IF NOT EXISTS job_selected_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES business_assets(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(job_id, asset_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_job_selected_assets_job ON job_selected_assets(job_id);
CREATE INDEX IF NOT EXISTS idx_job_selected_assets_asset ON job_selected_assets(asset_id);

-- RLS
ALTER TABLE job_selected_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view selections for their own jobs"
  ON job_selected_assets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = job_selected_assets.job_id
      AND jobs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert selections for their own jobs"
  ON job_selected_assets FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = job_selected_assets.job_id
      AND jobs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete selections for their own jobs"
  ON job_selected_assets FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = job_selected_assets.job_id
      AND jobs.user_id = auth.uid()
    )
  );

COMMENT ON TABLE job_selected_assets IS 'Per-run asset selection. Generation only uses assets explicitly selected for that specific job, filtered by usable_in at generation time.';
