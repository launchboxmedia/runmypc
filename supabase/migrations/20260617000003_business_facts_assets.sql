-- Business Facts table - typed entries per user
CREATE TABLE business_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('result', 'credential', 'product_spec', 'location', 'persona_note', 'other')),
  content TEXT NOT NULL,
  service_tag TEXT, -- optional niche/service filter (e.g., 'credit_repair', 'business_funding')
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Business Assets table - uploaded files linked to facts
CREATE TABLE business_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_fact_id UUID REFERENCES business_facts(id) ON DELETE SET NULL, -- nullable for standalone assets like logos
  file_path TEXT NOT NULL, -- path in Supabase Storage
  file_type TEXT NOT NULL DEFAULT 'image', -- for now just 'image', could expand later
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved', 'rejected')),
  pii_check_result JSONB, -- store PII detection results
  rejection_reason TEXT, -- why rejected (e.g., 'Contains PII: full name visible')
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_business_facts_user ON business_facts(user_id);
CREATE INDEX idx_business_facts_type ON business_facts(type);
CREATE INDEX idx_business_facts_service_tag ON business_facts(service_tag);
CREATE INDEX idx_business_assets_user ON business_assets(user_id);
CREATE INDEX idx_business_assets_fact ON business_assets(business_fact_id);
CREATE INDEX idx_business_assets_status ON business_assets(status);

-- RLS policies
ALTER TABLE business_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_assets ENABLE ROW LEVEL SECURITY;

-- Users can only see/edit their own facts
CREATE POLICY "Users can view own business facts"
  ON business_facts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own business facts"
  ON business_facts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own business facts"
  ON business_facts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own business facts"
  ON business_facts FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see/edit their own assets
CREATE POLICY "Users can view own business assets"
  ON business_assets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own business assets"
  ON business_assets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own business assets"
  ON business_assets FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own business assets"
  ON business_assets FOR DELETE
  USING (auth.uid() = user_id);

-- Add asset limits to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS max_business_assets INTEGER DEFAULT 20;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER business_facts_updated_at
  BEFORE UPDATE ON business_facts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER business_assets_updated_at
  BEFORE UPDATE ON business_assets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
