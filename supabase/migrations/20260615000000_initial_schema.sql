-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  business_name text,
  website text,
  industry text,

  -- Brand voice
  brand_tone text,
  writing_style_examples text,
  words_to_use text[],
  words_to_avoid text[],

  -- Visual assets (stored in Supabase Storage)
  logo_url text,
  brand_colors jsonb, -- {primary: '#hex', secondary: '#hex', ...}
  profile_photo_url text,

  -- Social handles
  instagram_handle text,
  tiktok_handle text,
  youtube_handle text,
  linkedin_handle text,

  -- Audience definition
  target_audience text,
  audience_pain_point text,
  desired_outcome text,

  -- Integration keys
  flipbookpro_api_key text,
  webhook_url text,
  telegram_chat_id text,

  -- Autopilot loop settings
  autopilot_loops boolean DEFAULT false,
  enabled_loops text[] DEFAULT array['content_refinement', 'ad_testing'],

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Jobs table
CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Job config
  topic text NOT NULL,
  target_audience text NOT NULL,
  desired_outcome text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('full_run', 'ebook_only', 'content_only', 'ads_only')),

  -- Loop support
  parent_job_id uuid REFERENCES jobs(id),
  loop_type text CHECK (loop_type IN ('content_refinement', 'ad_testing')),
  loop_number integer DEFAULT 0,

  -- FlipBookPro integration
  flipbookpro_url text,
  flipbookpro_book_id text,

  -- Status tracking
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  error_message text,

  -- Phase tracking
  current_phase integer DEFAULT 1,
  phase1_completed boolean DEFAULT false,
  phase2_completed boolean DEFAULT false,
  phase3_completed boolean DEFAULT false,

  -- Research data
  research_data jsonb,

  -- Generated content URLs (Supabase Storage)
  content_urls jsonb,

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

-- Job steps table
CREATE TABLE IF NOT EXISTS job_steps (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE NOT NULL,

  step_name text NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  error_message text,
  retry_count integer DEFAULT 0,

  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_steps ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- RLS Policies for jobs
CREATE POLICY "Users can view own jobs"
  ON jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own jobs"
  ON jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own jobs"
  ON jobs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own jobs"
  ON jobs FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for job_steps
CREATE POLICY "Users can view own job steps"
  ON job_steps FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = job_steps.job_id AND jobs.user_id = auth.uid()
  ));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_steps_job_id ON job_steps(job_id);

-- Function to auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call function on new user
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
