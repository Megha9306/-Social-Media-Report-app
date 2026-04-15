-- v5: Brand/profile tracking + link posts to brands

-- Brand/profile tracking table
CREATE TABLE IF NOT EXISTS brands (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  platform          TEXT NOT NULL CHECK(platform IN ('Instagram','Facebook','LinkedIn')),
  profile_url       TEXT UNIQUE NOT NULL,
  handle            TEXT,
  followers         INTEGER,
  total_posts       INTEGER DEFAULT 0,
  tagged_posts      INTEGER DEFAULT 0,
  non_tagged_posts  INTEGER DEFAULT 0,
  total_reach       INTEGER DEFAULT 0,
  avg_eng_rate      REAL,
  last_scraped      TEXT,
  scrape_status     TEXT DEFAULT 'idle' CHECK(scrape_status IN ('idle','scraping','completed','failed')),
  created_at        TEXT DEFAULT (datetime('now')),
  updated_at        TEXT DEFAULT (datetime('now'))
);

-- Link posts to brands + track origin and tagged status
ALTER TABLE posts ADD COLUMN brand_id    TEXT REFERENCES brands(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN tagged      INTEGER DEFAULT 0;
ALTER TABLE posts ADD COLUMN data_origin TEXT DEFAULT 'manual' CHECK(data_origin IN ('manual','scraped'));

CREATE INDEX IF NOT EXISTS idx_posts_brand_id ON posts(brand_id);
