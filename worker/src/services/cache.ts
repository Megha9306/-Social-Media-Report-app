import type { KVNamespace } from '@cloudflare/workers-types';

const CACHE_TTL = 600; // 10 minutes

export function buildCacheKey(filters: {
  platform?: string;
  format?: string;
  content_bucket?: string;
  campaign?: string;
  date_from?: string;
  date_to?: string;
}): string {
  const p  = filters.platform        ?? 'all';
  const f  = filters.format          ?? 'all';
  const b  = filters.content_bucket  ?? 'all';
  const c  = filters.campaign        ?? 'all';
  const df = filters.date_from       ?? 'all';
  const dt = filters.date_to         ?? 'all';
  return `report:${p}:${f}:${b}:${c}:${df}:${dt}`;
}

export async function getCached<T>(kv: KVNamespace, key: string): Promise<T | null> {
  const val = await kv.get(key, 'json');
  return val as T | null;
}

export async function setCached<T>(kv: KVNamespace, key: string, data: T): Promise<void> {
  await kv.put(key, JSON.stringify(data), { expirationTtl: CACHE_TTL });
}

export async function invalidateReportCache(kv: KVNamespace): Promise<void> {
  // KV doesn't support prefix deletion natively — list and delete
  let cursor: string | undefined;
  do {
    const list = await kv.list({ prefix: 'report:', cursor, limit: 1000 });
    await Promise.all(list.keys.map(k => kv.delete(k.name)));
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);
}
