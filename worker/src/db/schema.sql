-- Social Report Agent -- Fresh D1 schema
-- For existing databases, use: npm run db:migrate
-- Manual run (from worker/): wrangler d1 execute social-reports --file=src/db/schema.sql

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

CREATE TABLE IF NOT EXISTS posts (
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
  updated_at            TEXT DEFAULT (datetime('now')),
  post_type_category    TEXT CHECK(post_type_category IN ('own_post','collab','tagged','non_tagged')),
  uploader_handle       TEXT,
  uploader_followers    INTEGER,
  brand_id              TEXT REFERENCES brands(id) ON DELETE SET NULL,
  tagged                INTEGER DEFAULT 0,
  data_origin           TEXT DEFAULT 'manual' CHECK(data_origin IN ('manual','scraped'))
);

CREATE INDEX IF NOT EXISTS idx_posts_next_scrape ON posts(next_scrape_at) WHERE lock = 0;
CREATE INDEX IF NOT EXISTS idx_posts_platform ON posts(platform);
CREATE INDEX IF NOT EXISTS idx_posts_campaign ON posts(campaign);
CREATE INDEX IF NOT EXISTS idx_posts_brand_id ON posts(brand_id);

CREATE TABLE IF NOT EXISTS post_metrics (
  id                    TEXT PRIMARY KEY,
  post_id               TEXT UNIQUE NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  scraped_at            TEXT,
  month_date            TEXT,
  likes                 INTEGER DEFAULT 0,
  comments              INTEGER DEFAULT 0,
  shares                INTEGER DEFAULT 0,
  saves                 INTEGER DEFAULT 0,
  views                 INTEGER DEFAULT 0,
  others                INTEGER DEFAULT 0,
  impressions           INTEGER,
  reach                 INTEGER,
  clicks                INTEGER,
  ctr                   REAL,
  vtr                   REAL,
  active_eng            INTEGER,
  active_eng_rate       REAL,
  passive_eng           INTEGER,
  passive_eng_rate      REAL,
  likes_source          TEXT DEFAULT 'scraped',
  comments_source       TEXT DEFAULT 'scraped',
  shares_source         TEXT DEFAULT 'scraped',
  saves_source          TEXT DEFAULT 'scraped',
  views_source          TEXT DEFAULT 'scraped',
  impressions_source    TEXT DEFAULT 'manual',
  reach_source          TEXT DEFAULT 'manual',
  clicks_source         TEXT DEFAULT 'manual',
  data_source           TEXT DEFAULT 'scraped'
);

CREATE TABLE IF NOT EXISTS metrics_snapshots (
  id          TEXT PRIMARY KEY,
  post_id     TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  scraped_at  TEXT NOT NULL,
  likes       INTEGER,
  comments    INTEGER,
  shares      INTEGER,
  saves       INTEGER,
  views       INTEGER,
  impressions INTEGER,
  reach       INTEGER,
  clicks      INTEGER
);

CREATE INDEX IF NOT EXISTS idx_snapshots_post_time ON metrics_snapshots(post_id, scraped_at);

CREATE TABLE IF NOT EXISTS competitor_sets (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL DEFAULT 'Untitled',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS competitor_accounts (
  id         TEXT PRIMARY KEY,
  set_id     TEXT NOT NULL REFERENCES competitor_sets(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  handle     TEXT NOT NULL,
  platform   TEXT NOT NULL DEFAULT 'instagram',
  is_self    INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ca_set_id ON competitor_accounts(set_id);

CREATE TABLE IF NOT EXISTS competitor_runs (
  id           TEXT PRIMARY KEY,
  set_id       TEXT NOT NULL REFERENCES competitor_sets(id) ON DELETE CASCADE,
  status       TEXT DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed','partial')),
  triggered_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_cr_set_id ON competitor_runs(set_id);

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

CREATE TABLE IF NOT EXISTS competitor_posts (
  id               TEXT PRIMARY KEY,
  account_run_id   TEXT NOT NULL REFERENCES competitor_account_runs(id) ON DELETE CASCADE,
  post_id_external TEXT,
  post_url         TEXT,
  post_type        TEXT,
  published_at     TEXT,
  caption          TEXT,
  likes            INTEGER DEFAULT 0,
  comments         INTEGER DEFAULT 0,
  views            INTEGER,
  engagement       INTEGER,
  engagement_rate  REAL
);

CREATE INDEX IF NOT EXISTS idx_cp_account_run ON competitor_posts(account_run_id);

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
