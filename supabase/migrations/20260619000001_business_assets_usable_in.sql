-- Add usable_in field to business_assets for content-type tracking
-- Reuse existing table for both static and video assets (no separate video-assets table)

ALTER TABLE business_assets
ADD COLUMN usable_in TEXT NOT NULL DEFAULT 'both'
CHECK (usable_in IN ('static', 'video', 'both'));

-- Index for filtering by usable_in
CREATE INDEX idx_business_assets_usable_in ON business_assets(usable_in);

COMMENT ON COLUMN business_assets.usable_in IS 'Which content types this asset is usable for: static (GPT-Image-2 creatives), video (Hyperframes compositions), or both. Generation steps determine at use-time whether asset format/dimensions/resolution are actually usable, with fallback if not.';
