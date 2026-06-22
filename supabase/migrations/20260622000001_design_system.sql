-- Carousel design system: per-customer + per-job style and color.
-- Additive only. style_id is free text (validated in app code against StyleId);
-- no DB check constraint, to avoid coupling future style additions to migrations.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS style_id text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS primary_color text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS split_image_cover boolean NOT NULL DEFAULT false;

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS style_id text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS primary_color text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS split_image_cover boolean NOT NULL DEFAULT false;
