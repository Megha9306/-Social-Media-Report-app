import type { D1Database } from '@cloudflare/workers-types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompetitorSet {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface CompetitorAccount {
  id: string;
  set_id: string;
  label: string;
  handle: string;
  platform: string;   // 'instagram' | 'linkedin'
  is_self: number;
  sort_order: number;
  created_at: string;
}

export interface CompetitorRun {
  id: string;
  set_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'partial';
  triggered_at: string;
  completed_at: string | null;
}

export interface CompetitorAccountRun {
  id: string;
  run_id: string;
  account_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  followers: number | null;
  following: number | null;
  profile_pic_url: string | null;
  avg_likes: number | null;
  avg_comments: number | null;
  avg_views: number | null;
  avg_engagement: number | null;
  avg_engagement_rate: number | null;
  error: string | null;
  completed_at: string | null;
}

export interface CompetitorPost {
  id: string;
  account_run_id: string;
  post_id_external: string | null;
  post_url: string | null;
  post_type: string | null;
  published_at: string | null;
  caption: string | null;
  likes: number;
  comments: number;
  views: number | null;
  engagement: number;
  engagement_rate: number | null;
  content_bucket: string | null;
  sub_bucket: string | null;
  tags: string | null;
}

// ─── Sets ─────────────────────────────────────────────────────────────────────

export async function insertCompetitorSet(db: D1Database, set: CompetitorSet): Promise<void> {
  await db.prepare(
    `INSERT INTO competitor_sets (id, name, created_at, updated_at) VALUES (?,?,?,?)`
  ).bind(set.id, set.name, set.created_at, set.updated_at).run();
}

export async function listCompetitorSets(
  db: D1Database,
): Promise<(CompetitorSet & { accountCount: number })[]> {
  const rows = await db.prepare(
    `SELECT cs.*, COUNT(ca.id) AS accountCount
     FROM competitor_sets cs
     LEFT JOIN competitor_accounts ca ON ca.set_id = cs.id
     GROUP BY cs.id
     ORDER BY cs.updated_at DESC`,
  ).all<CompetitorSet & { accountCount: number }>();
  return rows.results ?? [];
}

export async function getCompetitorSet(db: D1Database, id: string): Promise<CompetitorSet | null> {
  return db.prepare(`SELECT * FROM competitor_sets WHERE id = ?`).bind(id).first<CompetitorSet>() ?? null;
}

export async function deleteCompetitorSet(db: D1Database, id: string): Promise<void> {
  await db.prepare(`DELETE FROM competitor_sets WHERE id = ?`).bind(id).run();
}

export async function touchCompetitorSet(db: D1Database, id: string): Promise<void> {
  await db.prepare(
    `UPDATE competitor_sets SET updated_at = datetime('now') WHERE id = ?`
  ).bind(id).run();
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

export async function insertCompetitorAccount(db: D1Database, account: CompetitorAccount): Promise<void> {
  await db.prepare(
    `INSERT INTO competitor_accounts (id, set_id, label, handle, platform, is_self, sort_order, created_at)
     VALUES (?,?,?,?,?,?,?,?)`
  ).bind(account.id, account.set_id, account.label, account.handle, account.platform, account.is_self, account.sort_order, account.created_at).run();
}

export async function listCompetitorAccounts(db: D1Database, setId: string): Promise<CompetitorAccount[]> {
  const rows = await db.prepare(
    `SELECT * FROM competitor_accounts WHERE set_id = ? ORDER BY sort_order ASC`
  ).bind(setId).all<CompetitorAccount>();
  return rows.results ?? [];
}

export async function deleteCompetitorAccountsBySet(db: D1Database, setId: string): Promise<void> {
  await db.prepare(`DELETE FROM competitor_accounts WHERE set_id = ?`).bind(setId).run();
}

export async function updateCompetitorAccountMeta(
  db: D1Database,
  id: string,
  label: string,
  sortOrder: number,
): Promise<void> {
  await db.prepare(
    `UPDATE competitor_accounts SET label = ?, sort_order = ? WHERE id = ?`
  ).bind(label, sortOrder, id).run();
}

// ─── Runs ─────────────────────────────────────────────────────────────────────

export async function insertCompetitorRun(db: D1Database, run: CompetitorRun): Promise<void> {
  await db.prepare(
    `INSERT INTO competitor_runs (id, set_id, status, triggered_at) VALUES (?,?,?,?)`
  ).bind(run.id, run.set_id, run.status, run.triggered_at).run();
}

export async function listCompetitorRuns(db: D1Database, setId: string): Promise<CompetitorRun[]> {
  const rows = await db.prepare(
    `SELECT * FROM competitor_runs WHERE set_id = ? ORDER BY triggered_at DESC`
  ).bind(setId).all<CompetitorRun>();
  return rows.results ?? [];
}

export async function getCompetitorRun(db: D1Database, id: string): Promise<CompetitorRun | null> {
  return db.prepare(`SELECT * FROM competitor_runs WHERE id = ?`).bind(id).first<CompetitorRun>() ?? null;
}

export async function deleteCompetitorRun(db: D1Database, id: string): Promise<void> {
  // Cascades to competitor_account_runs → competitor_posts via ON DELETE CASCADE
  await db.prepare(`DELETE FROM competitor_runs WHERE id = ?`).bind(id).run();
}

export async function updateCompetitorRunStatus(
  db: D1Database,
  id: string,
  status: CompetitorRun['status'],
): Promise<void> {
  const completedAt = (status === 'completed' || status === 'failed' || status === 'partial')
    ? new Date().toISOString() : null;
  await db.prepare(
    `UPDATE competitor_runs SET status = ?, completed_at = ? WHERE id = ?`
  ).bind(status, completedAt, id).run();
}

// ─── Account Runs ─────────────────────────────────────────────────────────────

export async function insertCompetitorAccountRun(db: D1Database, ar: CompetitorAccountRun): Promise<void> {
  await db.prepare(
    `INSERT INTO competitor_account_runs
       (id, run_id, account_id, status, followers, following, profile_pic_url,
        avg_likes, avg_comments, avg_views, avg_engagement, avg_engagement_rate, error, completed_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    ar.id, ar.run_id, ar.account_id, ar.status,
    ar.followers, ar.following, ar.profile_pic_url,
    ar.avg_likes, ar.avg_comments, ar.avg_views, ar.avg_engagement, ar.avg_engagement_rate,
    ar.error, ar.completed_at,
  ).run();
}

export async function updateCompetitorAccountRun(
  db: D1Database,
  id: string,
  fields: Partial<Omit<CompetitorAccountRun, 'id' | 'run_id' | 'account_id'>>,
): Promise<void> {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;
  const setClauses = entries.map(([k]) => `${k} = ?`).join(', ');
  const values = entries.map(([, v]) => v);
  await db.prepare(
    `UPDATE competitor_account_runs SET ${setClauses} WHERE id = ?`
  ).bind(...values, id).run();
}

export async function listCompetitorAccountRuns(db: D1Database, runId: string): Promise<CompetitorAccountRun[]> {
  const rows = await db.prepare(
    `SELECT * FROM competitor_account_runs WHERE run_id = ?`
  ).bind(runId).all<CompetitorAccountRun>();
  return rows.results ?? [];
}

export async function getCompetitorAccountRun(db: D1Database, id: string): Promise<CompetitorAccountRun | null> {
  return db.prepare(
    `SELECT * FROM competitor_account_runs WHERE id = ?`
  ).bind(id).first<CompetitorAccountRun>() ?? null;
}

// ─── Posts ────────────────────────────────────────────────────────────────────

export async function insertCompetitorPost(db: D1Database, post: CompetitorPost): Promise<void> {
  await db.prepare(
    `INSERT INTO competitor_posts
       (id, account_run_id, post_id_external, post_url, post_type, published_at,
        caption, likes, comments, views, engagement, engagement_rate)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    post.id, post.account_run_id, post.post_id_external, post.post_url,
    post.post_type, post.published_at, post.caption,
    post.likes, post.comments, post.views, post.engagement, post.engagement_rate,
  ).run();
}

export async function listCompetitorPosts(db: D1Database, accountRunId: string): Promise<CompetitorPost[]> {
  const rows = await db.prepare(
    `SELECT * FROM competitor_posts WHERE account_run_id = ? ORDER BY published_at DESC`
  ).bind(accountRunId).all<CompetitorPost>();
  return rows.results ?? [];
}

export async function updateCompetitorPost(
  db: D1Database,
  postId: string,
  fields: Partial<Pick<CompetitorPost, 'content_bucket' | 'sub_bucket' | 'tags'>>,
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  if ('content_bucket' in fields) { sets.push('content_bucket = ?'); values.push(fields.content_bucket ?? null); }
  if ('sub_bucket' in fields)     { sets.push('sub_bucket = ?');     values.push(fields.sub_bucket ?? null); }
  if ('tags' in fields)           { sets.push('tags = ?');           values.push(fields.tags ?? null); }
  if (sets.length === 0) return;
  values.push(postId);
  await db.prepare(`UPDATE competitor_posts SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();
}

// ─── Composite query: full run results ───────────────────────────────────────

export interface AccountRunWithDetails {
  account: CompetitorAccount;
  accountRun: CompetitorAccountRun;
  posts: CompetitorPost[];
}

export async function getFullRunResults(
  db: D1Database,
  runId: string,
): Promise<AccountRunWithDetails[]> {
  const accountRuns = await listCompetitorAccountRuns(db, runId);
  if (accountRuns.length === 0) return [];

  const accountIds = accountRuns.map(ar => ar.account_id);
  const accountRunIds = accountRuns.map(ar => ar.id);

  // Fetch all accounts in a single query
  const accountPlaceholders = accountIds.map(() => '?').join(',');
  const accountRows = await db
    .prepare(`SELECT * FROM competitor_accounts WHERE id IN (${accountPlaceholders})`)
    .bind(...accountIds)
    .all<CompetitorAccount>();
  const accountsById = new Map((accountRows.results ?? []).map(a => [a.id, a]));

  // Fetch all posts for all account runs in a single query
  const runPlaceholders = accountRunIds.map(() => '?').join(',');
  const postRows = await db
    .prepare(`SELECT * FROM competitor_posts WHERE account_run_id IN (${runPlaceholders}) ORDER BY published_at DESC`)
    .bind(...accountRunIds)
    .all<CompetitorPost>();
  const postsByAccountRunId = new Map<string, CompetitorPost[]>();
  for (const post of postRows.results ?? []) {
    const list = postsByAccountRunId.get(post.account_run_id) ?? [];
    list.push(post);
    postsByAccountRunId.set(post.account_run_id, list);
  }

  const results: AccountRunWithDetails[] = [];
  for (const ar of accountRuns) {
    const account = accountsById.get(ar.account_id);
    if (account) {
      results.push({ account, accountRun: ar, posts: postsByAccountRunId.get(ar.id) ?? [] });
    }
  }

  // Sort by sort_order (Me first, then competitors)
  results.sort((a, b) => a.account.sort_order - b.account.sort_order);
  return results;
}

// Check whether all account runs for a run are done
export async function checkRunCompletion(
  db: D1Database,
  runId: string,
): Promise<'running' | 'completed' | 'failed' | 'partial'> {
  const rows = await db.prepare(
    `SELECT status FROM competitor_account_runs WHERE run_id = ?`
  ).bind(runId).all<{ status: string }>();

  const statuses = (rows.results ?? []).map(r => r.status);
  if (statuses.length === 0) return 'failed';
  if (statuses.every(s => s === 'completed')) return 'completed';
  if (statuses.every(s => s === 'failed'))    return 'failed';
  if (statuses.some(s => s === 'pending' || s === 'running')) return 'running';
  return 'partial'; // mix of completed + failed
}
