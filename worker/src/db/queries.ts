import type { D1Database } from '@cloudflare/workers-types';

export interface Post {
  id: string;
  platform: string;
  content_bucket: string | null;
  sub_bucket: string | null;
  campaign: string | null;
  tags: string | null;
  format: string;
  post_url: string;
  post_url_normalized: string;
  post_id_external: string | null;
  post_published_at: string | null;
  lock: number;
  scrape_status: string;
  last_error: string | null;
  fail_count: number;
  next_scrape_at: string;
  created_at: string;
  updated_at: string;
  post_type_category: 'own_post' | 'collab' | 'tagged' | 'non_tagged' | null;
  uploader_handle: string | null;
  uploader_followers: number | null;
  brand_id: string | null;
  tagged: number;          // 0 or 1
  data_origin: 'manual' | 'scraped';
}

export interface PostMetrics {
  id: string;
  post_id: string;
  scraped_at: string | null;
  month_date: string | null;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  views: number;
  others: number;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  ctr: number | null;
  vtr: number | null;
  active_eng: number | null;
  active_eng_rate: number | null;
  passive_eng: number | null;
  passive_eng_rate: number | null;
  likes_source: string;
  comments_source: string;
  shares_source: string;
  saves_source: string;
  views_source: string;
  impressions_source: string;
  reach_source: string;
  clicks_source: string;
  data_source: string;
}

export interface MetricsSnapshot {
  id: string;
  post_id: string;
  scraped_at: string;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  views: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
}

export interface PostWithMetrics extends Post {
  metrics: PostMetrics | null;
  story_expires_at: string | null;
  brand_name: string | null;
}

export interface ListFilters {
  platform?: string;
  format?: string;
  content_bucket?: string;
  campaign?: string;
  date_from?: string; // YYYY-MM-DD
  date_to?: string;   // YYYY-MM-DD
  limit?: number;
  offset?: number;
  brand_id?: string;
  tagged?: boolean;
  data_origin?: 'manual' | 'scraped';
  tags?: string;
}

export async function getPostById(db: D1Database, id: string): Promise<Post | null> {
  const result = await db.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first<Post>();
  return result ?? null;
}

export async function getPostByUrl(db: D1Database, normalizedUrl: string): Promise<Post | null> {
  const result = await db
    .prepare('SELECT * FROM posts WHERE post_url_normalized = ?')
    .bind(normalizedUrl)
    .first<Post>();
  return result ?? null;
}

export async function insertPost(db: D1Database, post: Post): Promise<void> {
  await db
    .prepare(
      `INSERT INTO posts (id, platform, content_bucket, sub_bucket, campaign, tags, format, post_url,
        post_url_normalized, post_id_external, post_published_at, lock, scrape_status,
        last_error, fail_count, next_scrape_at, created_at, updated_at,
        brand_id, tagged, data_origin)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .bind(
      post.id, post.platform, post.content_bucket, post.sub_bucket ?? null, post.campaign, post.tags, post.format,
      post.post_url, post.post_url_normalized, post.post_id_external, post.post_published_at,
      post.lock, post.scrape_status, post.last_error, post.fail_count, post.next_scrape_at,
      post.created_at, post.updated_at,
      post.brand_id ?? null, post.tagged ?? 0, post.data_origin ?? 'manual',
    )
    .run();
}

export async function updatePost(db: D1Database, id: string, fields: Partial<Post>): Promise<void> {
  const entries = Object.entries(fields).filter(([k]) => k !== 'id');
  if (entries.length === 0) return;
  const setClauses = entries.map(([k]) => `${k} = ?`).join(', ');
  const values = entries.map(([, v]) => v);
  await db
    .prepare(`UPDATE posts SET ${setClauses}, updated_at = datetime('now') WHERE id = ?`)
    .bind(...values, id)
    .run();
}

export async function deletePost(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
}

export async function listPostsWithMetrics(
  db: D1Database,
  filters: ListFilters
): Promise<PostWithMetrics[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.platform) { conditions.push('p.platform = ?'); params.push(filters.platform); }
  if (filters.format)   { conditions.push('p.format = ?');   params.push(filters.format); }
  if (filters.content_bucket) { conditions.push('p.content_bucket = ?'); params.push(filters.content_bucket); }
  if (filters.campaign) { conditions.push('p.campaign = ?'); params.push(filters.campaign); }
  if (filters.date_from) { conditions.push('p.post_published_at >= ?'); params.push(filters.date_from); }
  if (filters.date_to)   { conditions.push('p.post_published_at <= ?'); params.push(filters.date_to); }
  if (filters.brand_id) { conditions.push('p.brand_id = ?'); params.push(filters.brand_id); }
  if (filters.tagged !== undefined) { conditions.push('p.tagged = ?'); params.push(filters.tagged ? 1 : 0); }
  if (filters.data_origin) { conditions.push('p.data_origin = ?'); params.push(filters.data_origin); }
  if (filters.tags) { conditions.push("p.tags LIKE ?"); params.push('%' + filters.tags + '%'); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit ?? 500;
  const offset = filters.offset ?? 0;

  const sql = `
    SELECT p.*,
      b.name AS brand_name,
      CASE WHEN p.format = 'Story' THEN datetime(p.created_at, '+24 hours') END AS story_expires_at,
      pm.id as m_id, pm.scraped_at, pm.month_date, pm.likes, pm.comments, pm.shares,
      pm.saves, pm.views, pm.others, pm.impressions, pm.reach, pm.clicks, pm.ctr, pm.vtr,
      pm.active_eng, pm.active_eng_rate, pm.passive_eng, pm.passive_eng_rate,
      pm.likes_source, pm.comments_source, pm.shares_source, pm.saves_source, pm.views_source,
      pm.impressions_source, pm.reach_source, pm.clicks_source, pm.data_source
    FROM posts p
    LEFT JOIN post_metrics pm ON pm.post_id = p.id
    LEFT JOIN brands b ON b.id = p.brand_id
    ${where}
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `;
  params.push(limit, offset);

  const rows = await db.prepare(sql).bind(...params).all<Record<string, unknown>>();
  return (rows.results ?? []).map(mapRowToPostWithMetrics);
}

function mapRowToPostWithMetrics(row: Record<string, unknown>): PostWithMetrics {
  const post: Post = {
    id: row['id'] as string,
    platform: row['platform'] as string,
    content_bucket: row['content_bucket'] as string | null,
    sub_bucket: row['sub_bucket'] as string | null,
    campaign: row['campaign'] as string | null,
    tags: row['tags'] as string | null,
    format: row['format'] as string,
    post_url: row['post_url'] as string,
    post_url_normalized: row['post_url_normalized'] as string,
    post_id_external: row['post_id_external'] as string | null,
    post_published_at: row['post_published_at'] as string | null,
    lock: row['lock'] as number,
    scrape_status: row['scrape_status'] as string,
    last_error: row['last_error'] as string | null,
    fail_count: row['fail_count'] as number,
    next_scrape_at: row['next_scrape_at'] as string,
    created_at: row['created_at'] as string,
    updated_at: row['updated_at'] as string,
    post_type_category: (row['post_type_category'] as Post['post_type_category']) ?? null,
    uploader_handle: (row['uploader_handle'] as string | null) ?? null,
    uploader_followers: (row['uploader_followers'] as number | null) ?? null,
    brand_id: (row['brand_id'] as string | null) ?? null,
    tagged: (row['tagged'] as number) ?? 0,
    data_origin: ((row['data_origin'] as string) ?? 'manual') as Post['data_origin'],
  };

  const metrics: PostMetrics | null = row['m_id']
    ? {
        id: row['m_id'] as string,
        post_id: post.id,
        scraped_at: row['scraped_at'] as string | null,
        month_date: row['month_date'] as string | null,
        likes: (row['likes'] as number) ?? 0,
        comments: (row['comments'] as number) ?? 0,
        shares: (row['shares'] as number) ?? 0,
        saves: (row['saves'] as number) ?? 0,
        views: (row['views'] as number) ?? 0,
        others: (row['others'] as number) ?? 0,
        impressions: row['impressions'] as number | null,
        reach: row['reach'] as number | null,
        clicks: row['clicks'] as number | null,
        ctr: row['ctr'] as number | null,
        vtr: row['vtr'] as number | null,
        active_eng: row['active_eng'] as number | null,
        active_eng_rate: row['active_eng_rate'] as number | null,
        passive_eng: row['passive_eng'] as number | null,
        passive_eng_rate: row['passive_eng_rate'] as number | null,
        likes_source: (row['likes_source'] as string) ?? 'scraped',
        comments_source: (row['comments_source'] as string) ?? 'scraped',
        shares_source: (row['shares_source'] as string) ?? 'scraped',
        saves_source: (row['saves_source'] as string) ?? 'scraped',
        views_source: (row['views_source'] as string) ?? 'scraped',
        impressions_source: (row['impressions_source'] as string) ?? 'manual',
        reach_source: (row['reach_source'] as string) ?? 'manual',
        clicks_source: (row['clicks_source'] as string) ?? 'manual',
        data_source: (row['data_source'] as string) ?? 'scraped',
      }
    : null;

  return {
    ...post,
    metrics,
    story_expires_at: (row['story_expires_at'] as string | null) ?? null,
    brand_name: (row['brand_name'] as string | null) ?? null,
  };
}

export async function getPostsDueForScrape(db: D1Database, limit = 500): Promise<Post[]> {
  const rows = await db
    .prepare(
      `SELECT * FROM posts
       WHERE lock = 0 AND next_scrape_at <= datetime('now')
         AND scrape_status NOT IN ('post_deleted', 'expired')
       ORDER BY next_scrape_at ASC
       LIMIT ?`
    )
    .bind(limit)
    .all<Post>();
  return rows.results ?? [];
}

export async function getFailedPosts(db: D1Database): Promise<Post[]> {
  const rows = await db
    .prepare(
      `SELECT * FROM posts
       WHERE scrape_status = 'failed' AND lock = 0
       ORDER BY updated_at ASC`
    )
    .all<Post>();
  return rows.results ?? [];
}

export async function getAllActivePosts(db: D1Database): Promise<Post[]> {
  const rows = await db
    .prepare(
      `SELECT * FROM posts
       WHERE scrape_status NOT IN ('post_deleted', 'expired')
       ORDER BY created_at ASC`
    )
    .all<Post>();
  return rows.results ?? [];
}

export async function upsertMetrics(db: D1Database, metrics: PostMetrics): Promise<void> {
  await db
    .prepare(
      `INSERT INTO post_metrics (
        id, post_id, scraped_at, month_date,
        likes, comments, shares, saves, views, others,
        impressions, reach, clicks,
        ctr, vtr, active_eng, active_eng_rate, passive_eng, passive_eng_rate,
        likes_source, comments_source, shares_source, saves_source, views_source,
        impressions_source, reach_source, clicks_source, data_source
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(post_id) DO UPDATE SET
        scraped_at        = excluded.scraped_at,
        month_date        = excluded.month_date,
        likes             = CASE WHEN post_metrics.likes_source = 'scraped' AND excluded.likes_source = 'scraped' THEN excluded.likes ELSE post_metrics.likes END,
        comments          = CASE WHEN post_metrics.comments_source = 'scraped' AND excluded.comments_source = 'scraped' THEN excluded.comments ELSE post_metrics.comments END,
        shares            = CASE WHEN post_metrics.shares_source = 'scraped' AND excluded.shares_source = 'scraped' THEN excluded.shares ELSE post_metrics.shares END,
        saves             = CASE WHEN post_metrics.saves_source = 'scraped' AND excluded.saves_source = 'scraped' THEN excluded.saves ELSE post_metrics.saves END,
        views             = CASE WHEN post_metrics.views_source = 'scraped' AND excluded.views_source = 'scraped' THEN excluded.views ELSE post_metrics.views END,
        others            = CASE WHEN post_metrics.views_source = 'scraped' AND excluded.views_source = 'scraped' THEN excluded.others ELSE post_metrics.others END,
        impressions       = CASE WHEN post_metrics.impressions_source = 'scraped' AND excluded.impressions_source = 'scraped' THEN excluded.impressions ELSE post_metrics.impressions END,
        reach             = CASE WHEN post_metrics.reach_source = 'scraped' AND excluded.reach_source = 'scraped' THEN excluded.reach ELSE post_metrics.reach END,
        clicks            = CASE WHEN post_metrics.clicks_source = 'scraped' AND excluded.clicks_source = 'scraped' THEN excluded.clicks ELSE post_metrics.clicks END,
        ctr               = excluded.ctr,
        vtr               = excluded.vtr,
        active_eng        = excluded.active_eng,
        active_eng_rate   = excluded.active_eng_rate,
        passive_eng       = excluded.passive_eng,
        passive_eng_rate  = excluded.passive_eng_rate,
        data_source       = excluded.data_source
    `
    )
    .bind(
      metrics.id, metrics.post_id, metrics.scraped_at, metrics.month_date,
      metrics.likes, metrics.comments, metrics.shares, metrics.saves, metrics.views, metrics.others,
      metrics.impressions, metrics.reach, metrics.clicks,
      metrics.ctr, metrics.vtr, metrics.active_eng, metrics.active_eng_rate,
      metrics.passive_eng, metrics.passive_eng_rate,
      metrics.likes_source, metrics.comments_source, metrics.shares_source,
      metrics.saves_source, metrics.views_source,
      metrics.impressions_source, metrics.reach_source, metrics.clicks_source,
      metrics.data_source
    )
    .run();
}

export async function insertSnapshot(db: D1Database, snapshot: MetricsSnapshot): Promise<void> {
  await db
    .prepare(
      `INSERT INTO metrics_snapshots (id, post_id, scraped_at, likes, comments, shares, saves, views, impressions, reach, clicks)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    )
    .bind(
      snapshot.id, snapshot.post_id, snapshot.scraped_at,
      snapshot.likes, snapshot.comments, snapshot.shares, snapshot.saves, snapshot.views,
      snapshot.impressions, snapshot.reach, snapshot.clicks
    )
    .run();
}

export async function getSnapshots(db: D1Database, postId: string, limit = 30): Promise<MetricsSnapshot[]> {
  const rows = await db
    .prepare(
      `SELECT * FROM metrics_snapshots WHERE post_id = ? ORDER BY scraped_at DESC LIMIT ?`
    )
    .bind(postId, limit)
    .all<MetricsSnapshot>();
  return (rows.results ?? []).reverse();
}

export async function getDistinctCampaigns(db: D1Database): Promise<string[]> {
  const rows = await db
    .prepare(`SELECT DISTINCT campaign FROM posts WHERE campaign IS NOT NULL ORDER BY campaign`)
    .all<{ campaign: string }>();
  return (rows.results ?? []).map(r => r.campaign);
}

export async function getMetricsByPostId(db: D1Database, postId: string): Promise<PostMetrics | null> {
  const result = await db
    .prepare('SELECT * FROM post_metrics WHERE post_id = ?')
    .bind(postId)
    .first<PostMetrics>();
  return result ?? null;
}

// ─── Analytics queries ────────────────────────────────────────────────────────

export type AnalyticsFilters = Omit<ListFilters, 'limit' | 'offset'>;

export interface AnalyticsMOMRow {
  month: string;
  post_count: number;
  total_views: number;
  total_impressions: number;
  total_active_eng: number;
  avg_active_eng_rate: number | null;
  total_passive_eng: number;
  avg_passive_eng_rate: number | null;
}

export async function getAnalyticsMOM(
  db: D1Database,
  filters: AnalyticsFilters,
): Promise<AnalyticsMOMRow[]> {
  const conditions: string[] = [
    'p.post_published_at IS NOT NULL',
    "p.post_published_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]*'",
  ];
  const params: unknown[] = [];

  if (filters.platform)       { conditions.push('p.platform = ?');        params.push(filters.platform); }
  if (filters.format)         { conditions.push('p.format = ?');           params.push(filters.format); }
  if (filters.content_bucket) { conditions.push('p.content_bucket = ?');   params.push(filters.content_bucket); }
  if (filters.campaign)       { conditions.push('p.campaign = ?');          params.push(filters.campaign); }
  if (filters.date_from)      { conditions.push('p.post_published_at >= ?'); params.push(filters.date_from); }
  if (filters.date_to)        { conditions.push('p.post_published_at <= ?'); params.push(filters.date_to); }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const sql = `
    SELECT
      substr(p.post_published_at, 1, 7) AS month,
      COUNT(*) AS post_count,
      COALESCE(SUM(pm.views), 0) AS total_views,
      COALESCE(SUM(pm.impressions), 0) AS total_impressions,
      COALESCE(SUM(pm.active_eng), 0) AS total_active_eng,
      AVG(pm.active_eng_rate) AS avg_active_eng_rate,
      COALESCE(SUM(pm.passive_eng), 0) AS total_passive_eng,
      AVG(pm.passive_eng_rate) AS avg_passive_eng_rate
    FROM posts p
    LEFT JOIN post_metrics pm ON pm.post_id = p.id
    ${where}
    GROUP BY substr(p.post_published_at, 1, 7)
    ORDER BY month ASC
  `;
  const rows = await db.prepare(sql).bind(...params).all<AnalyticsMOMRow>();
  return rows.results ?? [];
}

export interface FormatDeliveredRow {
  month: string;
  format: string;
  post_count: number;
}

export async function getFormatDeliveredMOM(
  db: D1Database,
  filters: AnalyticsFilters,
): Promise<FormatDeliveredRow[]> {
  const conditions: string[] = [
    'post_published_at IS NOT NULL',
    "post_published_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]*'",
  ];
  const params: unknown[] = [];

  if (filters.platform)       { conditions.push('platform = ?');        params.push(filters.platform); }
  if (filters.format)         { conditions.push('format = ?');           params.push(filters.format); }
  if (filters.content_bucket) { conditions.push('content_bucket = ?');   params.push(filters.content_bucket); }
  if (filters.campaign)       { conditions.push('campaign = ?');          params.push(filters.campaign); }
  if (filters.date_from)      { conditions.push('post_published_at >= ?'); params.push(filters.date_from); }
  if (filters.date_to)        { conditions.push('post_published_at <= ?'); params.push(filters.date_to); }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const sql = `
    SELECT
      substr(post_published_at, 1, 7) AS month,
      format,
      COUNT(*) AS post_count
    FROM posts
    ${where}
    GROUP BY month, format
    ORDER BY month ASC, format ASC
  `;
  const rows = await db.prepare(sql).bind(...params).all<FormatDeliveredRow>();
  return rows.results ?? [];
}

export interface BucketAnalysisRow {
  content_bucket: string;
  total_views: number;
  avg_active_eng_rate: number | null;
  post_count: number;
}

export async function getBucketAnalysis(
  db: D1Database,
  filters: AnalyticsFilters,
): Promise<BucketAnalysisRow[]> {
  const conditions: string[] = ['p.content_bucket IS NOT NULL'];
  const params: unknown[] = [];

  if (filters.platform)       { conditions.push('p.platform = ?');        params.push(filters.platform); }
  if (filters.format)         { conditions.push('p.format = ?');           params.push(filters.format); }
  if (filters.content_bucket) { conditions.push('p.content_bucket = ?');   params.push(filters.content_bucket); }
  if (filters.campaign)       { conditions.push('p.campaign = ?');          params.push(filters.campaign); }
  if (filters.date_from)      { conditions.push('p.post_published_at >= ?'); params.push(filters.date_from); }
  if (filters.date_to)        { conditions.push('p.post_published_at <= ?'); params.push(filters.date_to); }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const sql = `
    SELECT
      p.content_bucket,
      COALESCE(SUM(pm.views), 0) AS total_views,
      AVG(pm.active_eng_rate) AS avg_active_eng_rate,
      COUNT(*) AS post_count
    FROM posts p
    LEFT JOIN post_metrics pm ON pm.post_id = p.id
    ${where}
    GROUP BY p.content_bucket
    ORDER BY total_views DESC
  `;
  const rows = await db.prepare(sql).bind(...params).all<BucketAnalysisRow>();
  return rows.results ?? [];
}

export interface BucketMOMRow {
  month: string;
  content_bucket: string;
  total_views: number;
  avg_active_eng_rate: number | null;
}

export async function getBucketMOM(
  db: D1Database,
  filters: AnalyticsFilters,
): Promise<BucketMOMRow[]> {
  const conditions: string[] = [
    'p.post_published_at IS NOT NULL',
    "p.post_published_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]*'",
    'p.content_bucket IS NOT NULL',
  ];
  const params: unknown[] = [];

  if (filters.platform)       { conditions.push('p.platform = ?');        params.push(filters.platform); }
  if (filters.format)         { conditions.push('p.format = ?');           params.push(filters.format); }
  if (filters.content_bucket) { conditions.push('p.content_bucket = ?');   params.push(filters.content_bucket); }
  if (filters.campaign)       { conditions.push('p.campaign = ?');          params.push(filters.campaign); }
  if (filters.date_from)      { conditions.push('p.post_published_at >= ?'); params.push(filters.date_from); }
  if (filters.date_to)        { conditions.push('p.post_published_at <= ?'); params.push(filters.date_to); }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const sql = `
    SELECT
      substr(p.post_published_at, 1, 7) AS month,
      p.content_bucket,
      COALESCE(SUM(pm.views), 0) AS total_views,
      AVG(pm.active_eng_rate) AS avg_active_eng_rate
    FROM posts p
    LEFT JOIN post_metrics pm ON pm.post_id = p.id
    ${where}
    GROUP BY month, p.content_bucket
    ORDER BY month ASC
  `;
  const rows = await db.prepare(sql).bind(...params).all<BucketMOMRow>();
  return rows.results ?? [];
}

export async function getDistinctContentBuckets(db: D1Database): Promise<string[]> {
  const rows = await db
    .prepare('SELECT DISTINCT content_bucket FROM posts WHERE content_bucket IS NOT NULL ORDER BY content_bucket')
    .all<{ content_bucket: string }>();
  return (rows.results ?? []).map(r => r.content_bucket);
}

export async function updatePostTypeCategory(
  db: D1Database,
  postId: string,
  category: 'own_post' | 'collab' | 'tagged' | 'non_tagged',
): Promise<void> {
  await db
    .prepare(`UPDATE posts SET post_type_category = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(category, postId)
    .run();
}

export async function updatePostUploaderHandle(
  db: D1Database,
  postId: string,
  handle: string,
): Promise<void> {
  await db
    .prepare(`UPDATE posts SET uploader_handle = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(handle, postId)
    .run();
}

export async function updatePostUploaderInfo(
  db: D1Database,
  postId: string,
  handle: string,
  followers: number,
): Promise<void> {
  await db
    .prepare(`UPDATE posts SET uploader_handle = ?, uploader_followers = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(handle, followers, postId)
    .run();
}

// ─── Connected Accounts ───────────────────────────────────────────────────────

export interface ConnectedAccount {
  id: string;
  platform: string;
  account_id: string;
  username: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expiry: string | null;
  extra: string | null;  // JSON string
  connected_at: string;
  updated_at: string;
}

export async function listConnectedAccounts(db: D1Database): Promise<ConnectedAccount[]> {
  const rows = await db
    .prepare('SELECT * FROM connected_accounts ORDER BY platform ASC')
    .all<ConnectedAccount>();
  return rows.results ?? [];
}

export async function getConnectedAccountsByPlatform(
  db: D1Database,
  platform: string,
): Promise<ConnectedAccount[]> {
  const rows = await db
    .prepare('SELECT * FROM connected_accounts WHERE platform = ?')
    .bind(platform)
    .all<ConnectedAccount>();
  return rows.results ?? [];
}

export async function upsertConnectedAccount(
  db: D1Database,
  account: Omit<ConnectedAccount, 'connected_at' | 'updated_at'>,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO connected_accounts
         (id, platform, account_id, username, access_token, refresh_token, token_expiry, extra)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(platform, account_id) DO UPDATE SET
         username      = excluded.username,
         access_token  = excluded.access_token,
         refresh_token = excluded.refresh_token,
         token_expiry  = excluded.token_expiry,
         extra         = excluded.extra,
         updated_at    = datetime('now')`,
    )
    .bind(
      account.id,
      account.platform,
      account.account_id,
      account.username,
      account.access_token,
      account.refresh_token,
      account.token_expiry,
      account.extra,
    )
    .run();
}

export async function deleteConnectedAccount(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM connected_accounts WHERE id = ?').bind(id).run();
}

export async function updateConnectedAccountTokens(
  db: D1Database,
  id: string,
  accessToken: string,
  refreshToken: string | null,
  tokenExpiry: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE connected_accounts
       SET access_token = ?, refresh_token = ?, token_expiry = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .bind(accessToken, refreshToken, tokenExpiry, id)
    .run();
}

export async function updateMetricsFromApi(
  db: D1Database,
  postId: string,
  insights: { impressions?: number; reach?: number; saves?: number; clicks?: number },
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (insights.impressions != null) {
    sets.push('impressions = ?', 'impressions_source = ?');
    values.push(insights.impressions, 'api');
  }
  if (insights.reach != null) {
    sets.push('reach = ?', 'reach_source = ?');
    values.push(insights.reach, 'api');
  }
  if (insights.clicks != null) {
    sets.push('clicks = ?', 'clicks_source = ?');
    values.push(insights.clicks, 'api');
  }
  if (insights.saves != null) {
    sets.push('saves = ?', 'saves_source = ?');
    values.push(insights.saves, 'api');
  }

  if (sets.length === 0) return;
  values.push(postId);

  await db
    .prepare(`UPDATE post_metrics SET ${sets.join(', ')} WHERE post_id = ?`)
    .bind(...values)
    .run();
}

export async function listPostsWithMetricsSorted(
  db: D1Database,
  filters: ListFilters,
  sortBy: 'active_eng_rate' | 'passive_eng_rate' | 'views' | 'likes' | 'impressions' | 'weighted_score',
  sortDir: 'asc' | 'desc',
): Promise<PostWithMetrics[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.platform)       { conditions.push('p.platform = ?');        params.push(filters.platform); }
  if (filters.format)         { conditions.push('p.format = ?');           params.push(filters.format); }
  if (filters.content_bucket) { conditions.push('p.content_bucket = ?');   params.push(filters.content_bucket); }
  if (filters.campaign)       { conditions.push('p.campaign = ?');          params.push(filters.campaign); }
  if (filters.date_from)      { conditions.push('p.post_published_at >= ?'); params.push(filters.date_from); }
  if (filters.date_to)        { conditions.push('p.post_published_at <= ?'); params.push(filters.date_to); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit ?? 5;
  const offset = filters.offset ?? 0;
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC';

  // Weighted engagement score: likes + comments×1.5 + shares×2 + saves×3
  // Tier 1 (has uploader_followers): normalized by followers × 1000 for scale
  // Tier 2 (no followers): raw weighted score
  const weightedOrderBy = `
    CASE WHEN p.uploader_followers IS NOT NULL AND p.uploader_followers > 0 THEN 0 ELSE 1 END ASC,
    CASE
      WHEN p.uploader_followers IS NOT NULL AND p.uploader_followers > 0
      THEN (COALESCE(pm.likes,0)*1.0 + COALESCE(pm.comments,0)*1.5 + COALESCE(pm.shares,0)*2.0 + COALESCE(pm.saves,0)*3.0) / p.uploader_followers * 1000
      ELSE (COALESCE(pm.likes,0)*1.0 + COALESCE(pm.comments,0)*1.5 + COALESCE(pm.shares,0)*2.0 + COALESCE(pm.saves,0)*3.0)
    END ${dir} NULLS LAST
  `;

  const orderBy = sortBy === 'weighted_score'
    ? weightedOrderBy
    : `pm.${sortBy} ${dir} NULLS LAST, COALESCE(pm.active_eng, 0) ${dir}`;

  const sql = `
    SELECT p.*,
      CASE WHEN p.format = 'Story' THEN datetime(p.created_at, '+24 hours') END AS story_expires_at,
      pm.id as m_id, pm.scraped_at, pm.month_date, pm.likes, pm.comments, pm.shares,
      pm.saves, pm.views, pm.others, pm.impressions, pm.reach, pm.clicks, pm.ctr, pm.vtr,
      pm.active_eng, pm.active_eng_rate, pm.passive_eng, pm.passive_eng_rate,
      pm.likes_source, pm.comments_source, pm.shares_source, pm.saves_source, pm.views_source,
      pm.impressions_source, pm.reach_source, pm.clicks_source, pm.data_source
    FROM posts p
    LEFT JOIN post_metrics pm ON pm.post_id = p.id
    ${where}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `;
  params.push(limit, offset);

  const rows = await db.prepare(sql).bind(...params).all<Record<string, unknown>>();
  return (rows.results ?? []).map(mapRowToPostWithMetrics);
}
