-- Add optional FlipBookPro URL for content_only and ads_only modes
ALTER TABLE jobs ADD COLUMN flipbookpro_url TEXT;
