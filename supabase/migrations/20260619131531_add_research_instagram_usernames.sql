-- Add research_instagram_usernames column to profiles
-- Stores comma-separated list of Instagram usernames to scrape for content research

ALTER TABLE profiles ADD COLUMN research_instagram_usernames TEXT;

COMMENT ON COLUMN profiles.research_instagram_usernames IS 'Comma-separated Instagram usernames (influencers/competitors) to scrape for content research. Separate from user''s own handle.';
