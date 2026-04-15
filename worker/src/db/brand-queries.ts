import type { D1Database } from '@cloudflare/workers-types';

export interface Brand {
  id: string;
  name: string;
  platform: string;
  profile_url: string;
  handle: string | null;
  followers: number | null;
  total_posts: number;
  tagged_posts: number;
  non_tagged_posts: number;
  total_reach: number;
  avg_eng_rate: number | null;
  last_scraped: string | null;
  scrape_status: 'idle' | 'scraping' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
}

export async function insertBrand(db: D1Database, brand: Brand): Promise<void> {
  await db
    .prepare(
      `INSERT INTO brands (id, name, platform, profile_url, handle, followers,
         total_posts, tagged_posts, non_tagged_posts, total_reach, avg_eng_rate,
         last_scraped, scrape_status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .bind(
      brand.id, brand.name, brand.platform, brand.profile_url, brand.handle,
      brand.followers, brand.total_posts, brand.tagged_posts, brand.non_tagged_posts,
      brand.total_reach, brand.avg_eng_rate, brand.last_scraped, brand.scrape_status,
      brand.created_at, brand.updated_at,
    )
    .run();
}

export async function getBrand(db: D1Database, id: string): Promise<Brand | null> {
  const row = await db.prepare('SELECT * FROM brands WHERE id = ?').bind(id).first<Brand>();
  return row ?? null;
}

export async function getBrandByUrl(db: D1Database, profileUrl: string): Promise<Brand | null> {
  const row = await db
    .prepare('SELECT * FROM brands WHERE profile_url = ?')
    .bind(profileUrl)
    .first<Brand>();
  return row ?? null;
}

export async function listBrands(db: D1Database): Promise<Brand[]> {
  // Return stored brand rows (counts are updated on each scrape run)
  const rows = await db
    .prepare('SELECT * FROM brands ORDER BY created_at DESC')
    .all<Brand>();
  return rows.results ?? [];
}

export async function updateBrand(db: D1Database, id: string, fields: Partial<Brand>): Promise<void> {
  const entries = Object.entries(fields).filter(([k]) => k !== 'id');
  if (entries.length === 0) return;
  const setClauses = entries.map(([k]) => `${k} = ?`).join(', ');
  const values = entries.map(([, v]) => v);
  await db
    .prepare(`UPDATE brands SET ${setClauses}, updated_at = datetime('now') WHERE id = ?`)
    .bind(...values, id)
    .run();
}

export async function deleteBrand(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM brands WHERE id = ?').bind(id).run();
}
