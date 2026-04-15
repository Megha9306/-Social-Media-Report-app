-- Add platform column to competitor_accounts
-- Run: wrangler d1 execute social-reports --file=worker/src/db/migrations/v4_competitor_platform.sql

ALTER TABLE competitor_accounts ADD COLUMN platform TEXT NOT NULL DEFAULT 'instagram';
