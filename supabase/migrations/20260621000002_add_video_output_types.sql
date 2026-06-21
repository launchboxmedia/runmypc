-- Ensure video output_type enum values exist.
-- 'social_video'   — per-post Hyperframes agent-driven social videos (Step 5).
-- 'cinematic_video' — Seedance hero video (Step 7).
-- Idempotent insurance: both are expected to already exist; this guarantees it
-- so video rows never silently fail to insert (was root cause of zero videos
-- when Step 5 wrote the non-existent 'platform_video').
ALTER TYPE output_type ADD VALUE IF NOT EXISTS 'social_video';
ALTER TYPE output_type ADD VALUE IF NOT EXISTS 'cinematic_video';
