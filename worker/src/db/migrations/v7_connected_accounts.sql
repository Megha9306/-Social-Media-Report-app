-- Add connected_accounts table for OAuth token storage
-- Run: wrangler d1 execute social-reports --file=worker/src/db/migrations/v7_connected_accounts.sql

CREATE TABLE IF NOT EXISTS connected_accounts (
  id            TEXT PRIMARY KEY,
  platform      TEXT NOT NULL,
  account_id    TEXT NOT NULL,
  username      TEXT,
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  token_expiry  TEXT,
  extra         TEXT,
  connected_at  TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now')),
  UNIQUE(platform, account_id)
);
