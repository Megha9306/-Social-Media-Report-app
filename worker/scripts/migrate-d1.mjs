import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workerDir = resolve(scriptDir, '..');
const tempDir = resolve(workerDir, '.wrangler', 'tmp');
const schemaFile = resolve(workerDir, 'src', 'db', 'schema.sql');
const wranglerBin = [
  resolve(workerDir, '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
  resolve(workerDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
].find(existsSync);

const modeFlag = process.argv.includes('--remote') ? '--remote' : '--local';
const databaseName = 'social-reports';

let tempCounter = 0;

function parseWranglerJson(output) {
  const match = output.match(/\[\s*\{[\s\S]*\}\s*\]\s*$/);
  if (!match) {
    throw new Error(`Could not parse Wrangler output:\n${output}`);
  }
  return JSON.parse(match[0]);
}

function runWrangler(args) {
  if (!wranglerBin) {
    throw new Error('Could not find a local Wrangler installation.');
  }

  const result = spawnSync(process.execPath, [wranglerBin, 'd1', 'execute', databaseName, modeFlag, ...args], {
    cwd: workerDir,
    encoding: 'utf8',
  });

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(output.trim() || `Wrangler exited with code ${result.status}`);
  }
  return output;
}

function query(sql) {
  const output = runWrangler(['--command', sql]);
  const payload = parseWranglerJson(output);
  return payload[0]?.results ?? [];
}

function execSql(sql, label) {
  if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });
  const tempFile = join(tempDir, `codex-migrate-${Date.now()}-${tempCounter++}.sql`);
  writeFileSync(tempFile, sql, 'utf8');
  try {
    runWrangler(['--file', tempFile]);
    if (label) console.log(label);
  } finally {
    rmSync(tempFile, { force: true });
  }
}

function execSqlFile(filePath, label) {
  runWrangler(['--file', filePath]);
  if (label) console.log(label);
}

function getTables() {
  return new Set(query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;").map((row) => row.name));
}

function getColumns(tableName) {
  return new Set(query(`PRAGMA table_info(${tableName});`).map((row) => row.name));
}

function getTableSql(tableName) {
  const safeName = tableName.replace(/'/g, "''");
  return query(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${safeName}';`)[0]?.sql ?? '';
}

function hasColumn(columns, columnName) {
  return columns.has(columnName);
}

function buildPostsRebuildSql(columns, tables) {
  const selectExpr = (column, fallback) => hasColumn(columns, column) ? column : `${fallback} AS ${column}`;
  const childRenames = [];
  const childRestores = [];

  if (tables.has('post_metrics')) {
    childRenames.push('ALTER TABLE post_metrics RENAME TO post_metrics_bak;');
    childRestores.push('ALTER TABLE post_metrics_bak RENAME TO post_metrics;');
  }
  if (tables.has('metrics_snapshots')) {
    childRenames.push('ALTER TABLE metrics_snapshots RENAME TO metrics_snapshots_bak;');
    childRestores.push('ALTER TABLE metrics_snapshots_bak RENAME TO metrics_snapshots;');
  }

  return `
PRAGMA foreign_keys = OFF;
${childRenames.join('\n')}
DROP TABLE IF EXISTS posts_latest;
CREATE TABLE posts_latest (
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
INSERT INTO posts_latest (
  id, platform, content_bucket, sub_bucket, campaign, tags, format,
  post_url, post_url_normalized, post_id_external, post_published_at,
  lock, scrape_status, last_error, fail_count, next_scrape_at,
  created_at, updated_at, post_type_category, uploader_handle, uploader_followers,
  brand_id, tagged, data_origin
)
SELECT
  ${selectExpr('id', "lower(hex(randomblob(16)))")},
  ${selectExpr('platform', "'Instagram'")},
  ${selectExpr('content_bucket', 'NULL')},
  ${selectExpr('sub_bucket', 'NULL')},
  ${selectExpr('campaign', 'NULL')},
  ${selectExpr('tags', 'NULL')},
  ${selectExpr('format', "'Static'")},
  ${selectExpr('post_url', "''")},
  ${selectExpr('post_url_normalized', "''")},
  ${selectExpr('post_id_external', 'NULL')},
  ${selectExpr('post_published_at', 'NULL')},
  ${selectExpr('lock', '0')},
  ${hasColumn(columns, 'scrape_status')
    ? "CASE WHEN scrape_status IN ('pending','success','failed','post_deleted','expired') THEN scrape_status ELSE 'pending' END"
    : "'pending' AS scrape_status"},
  ${selectExpr('last_error', 'NULL')},
  ${selectExpr('fail_count', '0')},
  ${selectExpr('next_scrape_at', "datetime('now')")},
  ${selectExpr('created_at', "datetime('now')")},
  ${selectExpr('updated_at', "datetime('now')")},
  ${hasColumn(columns, 'post_type_category')
    ? "CASE WHEN post_type_category IN ('own_post','collab','tagged','non_tagged') THEN post_type_category ELSE NULL END"
    : 'NULL AS post_type_category'},
  ${selectExpr('uploader_handle', 'NULL')},
  ${selectExpr('uploader_followers', 'NULL')},
  ${selectExpr('brand_id', 'NULL')},
  ${selectExpr('tagged', '0')},
  ${hasColumn(columns, 'data_origin')
    ? "CASE WHEN data_origin IN ('manual','scraped') THEN data_origin ELSE 'manual' END"
    : "'manual' AS data_origin"}
FROM posts;
DROP TABLE posts;
ALTER TABLE posts_latest RENAME TO posts;
${childRestores.join('\n')}
CREATE INDEX IF NOT EXISTS idx_posts_next_scrape ON posts(next_scrape_at) WHERE lock = 0;
CREATE INDEX IF NOT EXISTS idx_posts_platform ON posts(platform);
CREATE INDEX IF NOT EXISTS idx_posts_campaign ON posts(campaign);
CREATE INDEX IF NOT EXISTS idx_posts_brand_id ON posts(brand_id);
PRAGMA foreign_keys = ON;
`.trim();
}

function ensureBrandsTable(tables) {
  if (tables.has('brands')) return;
  execSql(
    `
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
`.trim(),
    'Created brands table',
  );
}

function ensureMetricsTables(tables) {
  if (!tables.has('post_metrics')) {
    execSql(
      `
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
`.trim(),
      'Created post_metrics table',
    );
  }

  if (!tables.has('metrics_snapshots')) {
    execSql(
      `
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
`.trim(),
      'Created metrics_snapshots table',
    );
  } else {
    execSql(
      'CREATE INDEX IF NOT EXISTS idx_snapshots_post_time ON metrics_snapshots(post_id, scraped_at);',
      'Ensured metrics_snapshots index',
    );
  }
}

function ensureCompetitorTables(tables) {
  if (!tables.has('competitor_sets')) {
    execSql(
      `
CREATE TABLE IF NOT EXISTS competitor_sets (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL DEFAULT 'Untitled',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
`.trim(),
      'Created competitor_sets table',
    );
  }

  if (!tables.has('competitor_accounts')) {
    execSql(
      `
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
`.trim(),
      'Created competitor_accounts table',
    );
  } else {
    execSql(
      'CREATE INDEX IF NOT EXISTS idx_ca_set_id ON competitor_accounts(set_id);',
      'Ensured competitor_accounts index',
    );
  }

  if (!tables.has('competitor_runs')) {
    execSql(
      `
CREATE TABLE IF NOT EXISTS competitor_runs (
  id           TEXT PRIMARY KEY,
  set_id       TEXT NOT NULL REFERENCES competitor_sets(id) ON DELETE CASCADE,
  status       TEXT DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed','partial')),
  triggered_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_cr_set_id ON competitor_runs(set_id);
`.trim(),
      'Created competitor_runs table',
    );
  } else {
    execSql(
      'CREATE INDEX IF NOT EXISTS idx_cr_set_id ON competitor_runs(set_id);',
      'Ensured competitor_runs index',
    );
  }

  if (!tables.has('competitor_account_runs')) {
    execSql(
      `
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
`.trim(),
      'Created competitor_account_runs table',
    );
  } else {
    execSql(
      'CREATE INDEX IF NOT EXISTS idx_car_run_id ON competitor_account_runs(run_id);',
      'Ensured competitor_account_runs index',
    );
  }

  if (!tables.has('competitor_posts')) {
    execSql(
      `
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
`.trim(),
      'Created competitor_posts table',
    );
  } else {
    execSql(
      'CREATE INDEX IF NOT EXISTS idx_cp_account_run ON competitor_posts(account_run_id);',
      'Ensured competitor_posts index',
    );
  }
}

function ensurePostsV3Columns(columns) {
  if (!hasColumn(columns, 'post_type_category')) {
    execSql(
      "ALTER TABLE posts ADD COLUMN post_type_category TEXT CHECK(post_type_category IN ('own_post','collab','tagged','non_tagged')) DEFAULT NULL;",
      'Added posts.post_type_category',
    );
  }
  if (!hasColumn(columns, 'uploader_handle')) {
    execSql(
      'ALTER TABLE posts ADD COLUMN uploader_handle TEXT DEFAULT NULL;',
      'Added posts.uploader_handle',
    );
  }
  if (!hasColumn(columns, 'uploader_followers')) {
    execSql(
      'ALTER TABLE posts ADD COLUMN uploader_followers INTEGER DEFAULT NULL;',
      'Added posts.uploader_followers',
    );
  }
}

function ensurePostsBrandColumns(columns) {
  if (!hasColumn(columns, 'brand_id')) {
    execSql(
      'ALTER TABLE posts ADD COLUMN brand_id TEXT REFERENCES brands(id) ON DELETE SET NULL;',
      'Added posts.brand_id',
    );
  }
  if (!hasColumn(columns, 'tagged')) {
    execSql(
      'ALTER TABLE posts ADD COLUMN tagged INTEGER DEFAULT 0;',
      'Added posts.tagged',
    );
  }
  if (!hasColumn(columns, 'data_origin')) {
    execSql(
      "ALTER TABLE posts ADD COLUMN data_origin TEXT DEFAULT 'manual' CHECK(data_origin IN ('manual','scraped'));",
      'Added posts.data_origin',
    );
  }
  execSql(
    'CREATE INDEX IF NOT EXISTS idx_posts_brand_id ON posts(brand_id);',
    'Ensured posts brand index',
  );
}

function ensureCompetitorPlatform(columns) {
  if (hasColumn(columns, 'platform')) return;
  execSql(
    "ALTER TABLE competitor_accounts ADD COLUMN platform TEXT NOT NULL DEFAULT 'instagram';",
    'Added competitor_accounts.platform',
  );
}

function ensureConnectedAccountsTable(tables) {
  if (tables.has('connected_accounts')) return;
  execSql(
    `
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
`.trim(),
    'Created connected_accounts table',
  );
}

function ensureCompetitorPostsCategories(tables) {
  if (!tables.has('competitor_posts')) return;
  const cols = getColumns('competitor_posts');
  if (!hasColumn(cols, 'content_bucket')) {
    execSql('ALTER TABLE competitor_posts ADD COLUMN content_bucket TEXT;', 'Added competitor_posts.content_bucket');
  }
  if (!hasColumn(cols, 'sub_bucket')) {
    execSql('ALTER TABLE competitor_posts ADD COLUMN sub_bucket TEXT;', 'Added competitor_posts.sub_bucket');
  }
  if (!hasColumn(cols, 'tags')) {
    execSql('ALTER TABLE competitor_posts ADD COLUMN tags TEXT;', 'Added competitor_posts.tags');
  }
}

function main() {
  console.log(`Syncing ${databaseName} (${modeFlag === '--remote' ? 'remote' : 'local'}) from ${workerDir}`);

  let tables = getTables();
  if (!tables.has('posts')) {
    if (!existsSync(schemaFile)) {
      throw new Error(`Schema file not found: ${schemaFile}`);
    }
    execSqlFile(schemaFile, 'Applied fresh schema file');
    tables = getTables();
  }

  ensureMetricsTables(tables);
  ensureBrandsTable(tables);
  ensureCompetitorTables(tables);
  tables = getTables();

  let postColumns = getColumns('posts');
  const postsSql = getTableSql('posts');
  const needsPostsRebuild = !hasColumn(postColumns, 'sub_bucket') || !postsSql.includes("'expired'");

  if (needsPostsRebuild) {
    execSql(buildPostsRebuildSql(postColumns, tables), 'Rebuilt posts table to latest schema');
    tables = getTables();
    postColumns = getColumns('posts');
  }

  ensurePostsV3Columns(postColumns);
  postColumns = getColumns('posts');

  ensureBrandsTable(tables);
  ensurePostsBrandColumns(postColumns);

  const competitorColumns = getColumns('competitor_accounts');
  ensureCompetitorPlatform(competitorColumns);
  ensureCompetitorPostsCategories(tables);

  tables = getTables();
  ensureConnectedAccountsTable(tables);

  const finalTables = [...getTables()].sort();
  const finalPostColumns = [...getColumns('posts')].sort();

  console.log(`Tables: ${finalTables.join(', ')}`);
  console.log(`posts columns: ${finalPostColumns.join(', ')}`);
  console.log('D1 schema is up to date.');
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
