-- Competitor Analysis Schema
-- Run: wrangler d1 execute social-reports --file=worker/src/db/competitor-schema.sql

-- A named group of competitor accounts to compare together
CREATE TABLE IF NOT EXISTS competitor_sets (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL DEFAULT 'Untitled',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Individual accounts (handles) in a competitor set
CREATE TABLE IF NOT EXISTS competitor_accounts (
  id         TEXT PRIMARY KEY,
  set_id     TEXT NOT NULL REFERENCES competitor_sets(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,   -- "Me", "Comp 1", "Comp 2" …
  handle     TEXT NOT NULL,   -- instagram username or linkedin.com/company/slug
  platform   TEXT NOT NULL DEFAULT 'instagram',
  is_self    INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ca_set_id ON competitor_accounts(set_id);

-- One run is created each time the user clicks "Analyze" for a set
CREATE TABLE IF NOT EXISTS competitor_runs (
  id           TEXT PRIMARY KEY,
  set_id       TEXT NOT NULL REFERENCES competitor_sets(id) ON DELETE CASCADE,
  status       TEXT DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed','partial')),
  triggered_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_cr_set_id ON competitor_runs(set_id);

-- Per-account result within a single run
CREATE TABLE IF NOT EXISTS competitor_account_runs (
  id                  TEXT PRIMARY KEY,
  run_id              TEXT NOT NULL REFERENCES competitor_runs(id) ON DELETE CASCADE,
  account_id          TEXT NOT NULL REFERENCES competitor_accounts(id) ON DELETE CASCADE,
  status              TEXT DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed')),
  followers           INTEGER,
  following           INTEGER,
  profile_pic_url     TEXT,
  avg_likes           REAL,
  avg_comments        REAL,
  avg_views           REAL,
  avg_engagement      REAL,
  avg_engagement_rate REAL,
  error               TEXT,
  completed_at        TEXT
);

CREATE INDEX IF NOT EXISTS idx_car_run_id ON competitor_account_runs(run_id);

-- Individual posts scraped from a competitor profile
CREATE TABLE IF NOT EXISTS competitor_posts (
  id               TEXT PRIMARY KEY,
  account_run_id   TEXT NOT NULL REFERENCES competitor_account_runs(id) ON DELETE CASCADE,
  post_id_external TEXT,
  post_url         TEXT,
  post_type        TEXT,  -- 'Image' | 'Video' | 'Sidecar'
  published_at     TEXT,
  caption          TEXT,
  likes            INTEGER DEFAULT 0,
  comments         INTEGER DEFAULT 0,
  views            INTEGER,
  engagement       INTEGER,
  engagement_rate  REAL
);

CREATE INDEX IF NOT EXISTS idx_cp_account_run ON competitor_posts(account_run_id);
