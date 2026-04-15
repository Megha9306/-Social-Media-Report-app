-- Migration v6: Add content_bucket, sub_bucket, tags to competitor_posts
-- Run: wrangler d1 execute social-reports --file=worker/src/db/migrations/v6_competitor_post_categories.sql

ALTER TABLE competitor_posts ADD COLUMN content_bucket TEXT;
ALTER TABLE competitor_posts ADD COLUMN sub_bucket TEXT;
ALTER TABLE competitor_posts ADD COLUMN tags TEXT;
