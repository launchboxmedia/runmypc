-- Add 'social_post' to the output_type enum.
-- Social posts were previously persisted as output_type='ad_copy' with
-- metadata.type='social_post', which collided with real ad-generation output.
-- They now get their own output_type so social copy and ad copy are cleanly
-- separable in queries and in the UI.
ALTER TYPE output_type ADD VALUE IF NOT EXISTS 'social_post';
