import type { ConnectedAccount } from '../../db/queries';
import type { PartialMetrics } from './meta-instagram';

const GRAPH = 'https://graph.facebook.com/v19.0';

// ─── URL parsing ──────────────────────────────────────────────────────────────

function extractPostId(postUrl: string): string | null {
  // facebook.com/{page}/posts/{id}
  // facebook.com/permalink.php?story_fbid={id}
  // facebook.com/{page}/videos/{id}
  const patterns = [
    /\/posts\/(\d+)/,
    /story_fbid=(\d+)/,
    /\/videos\/(\d+)/,
    /\/photos\/[^/]+\/(\d+)/,
  ];
  for (const p of patterns) {
    const m = postUrl.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function getFacebookInsights(
  postUrl: string,
  account: ConnectedAccount,
): Promise<PartialMetrics | null> {
  const postId = extractPostId(postUrl);
  if (!postId) return null;

  const extra: Record<string, string> = account.extra ? JSON.parse(account.extra) : {};
  const pageId    = extra.page_id;
  const pageToken = extra.page_token;
  if (!pageId || !pageToken) return null;

  const pagePostId = `${pageId}_${postId}`;

  const metrics = [
    'post_impressions',
    'post_impressions_unique',
    'post_clicks',
    'post_activity',
  ].join(',');

  const res = await fetch(
    `${GRAPH}/${pagePostId}/insights?metric=${metrics}&access_token=${pageToken}`,
  );
  if (!res.ok) return null;
  const data = await res.json<{
    data?: Array<{ name: string; values?: Array<{ value: number }>; value?: number }>;
  }>();

  const result: PartialMetrics = {};
  for (const item of data.data ?? []) {
    // Most page insights use a values array with period snapshots; take the last
    const val = item.value ?? item.values?.at(-1)?.value;
    if (val == null) continue;
    if (item.name === 'post_impressions')        result.impressions = val;
    if (item.name === 'post_impressions_unique') result.reach       = val;
    if (item.name === 'post_clicks')             result.clicks      = val;
  }
  return result;
}
