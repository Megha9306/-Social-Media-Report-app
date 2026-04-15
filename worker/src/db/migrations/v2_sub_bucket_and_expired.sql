-- Migration v2: Add sub_bucket column + 'expired' to scrape_status CHECK
-- SQLite cannot ALTER a CHECK constraint, so we recreate the posts table.
-- Child tables (post_metrics, metrics_snapshots) are detached + re-attached to survive the DROP.

PRAGMA foreign_keys = OFF;

-- 1. Temporarily detach child table FK references by renaming them
ALTER TABLE post_metrics RENAME TO post_metrics_bak;
ALTER TABLE metrics_snapshots RENAME TO metrics_snapshots_bak;

-- 2. Recreate posts with new schema
CREATE TABLE IF NOT EXISTS posts_v2 (
  id                    TEXT PRIMARY KEY,
  platform              TEXT NOT NULL CHECK(platform IN ('Instagram','Facebook','Twitter','LinkedIn','YouTube')),
  content_bucket        TEXT,
  sub_bucket            TEXT,
  campaign              TEXT,
  tags                  TEXT,
  format                TEXT NOT NULL CHECK(format IN ('Static','Carousel','Gif','Reel','Video Post','Story','Article')),
  post_url              TEXT UNIQUE NOT NULL,
  post_url_normalized   TEXT UNIQUE NOT NULL,
  post_id_external      TEXT,
  post_published_at     TEXT,
  lock                  INTEGER DEFAULT 0,
  scrape_status         TEXT DEFAULT 'pending' CHECK(scrape_status IN ('pending','success','failed','post_deleted','expired')),
  last_error            TEXT,
  fail_count            INTEGER DEFAULT 0,
  next_scrape_at        TEXT DEFAULT (datetime('now')),
  created_at            TEXT DEFAULT (datetime('now')),
  updated_at            TEXT DEFAULT (datetime('now'))
);

INSERT INTO posts_v2 (
  id, platform, content_bucket, sub_bucket, campaign, tags, format,
  post_url, post_url_normalized, post_id_external, post_published_at,
  lock, scrape_status, last_error, fail_count, next_scrape_at, created_at, updated_at
)
SELECT
  id, platform, content_bucket, NULL, campaign, tags, format,
  post_url, post_url_normalized, post_id_external, post_published_at,
  lock, scrape_status, last_error, fail_count, next_scrape_at, created_at, updated_at
FROM posts;

DROP TABLE posts;
ALTER TABLE posts_v2 RENAME TO posts;

-- 3. Restore child tables under original names
ALTER TABLE post_metrics_bak RENAME TO post_metrics;
ALTER TABLE metrics_snapshots_bak RENAME TO metrics_snapshots;

CREATE INDEX IF NOT EXISTS idx_posts_next_scrape ON posts(next_scrape_at) WHERE lock = 0;
CREATE INDEX IF NOT EXISTS idx_posts_platform ON posts(platform);
CREATE INDEX IF NOT EXISTS idx_posts_campaign ON posts(campaign);

PRAGMA foreign_keys = ON;
