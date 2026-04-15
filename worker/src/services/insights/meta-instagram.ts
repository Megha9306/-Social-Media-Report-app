import type { ConnectedAccount } from '../../db/queries';

const GRAPH = 'https://graph.facebook.com/v19.0';

export interface PartialMetrics {
  impressions?: number;
  reach?: number;
  saves?: number;
  clicks?: number;
}

// ─── URL parsing ──────────────────────────────────────────────────────────────

function extractShortcode(postUrl: string): string | null {
  // Matches /p/{shortcode}/ and /reel/{shortcode}/
  const m = postUrl.match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  return m?.[1] ?? null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function getInstagramInsights(
  postUrl: string,
  account: ConnectedAccount,
): Promise<PartialMetrics | null> {
  const shortcode = extractShortcode(postUrl);
  if (!shortcode) return null;

  const extra: Record<string, string> = account.extra ? JSON.parse(account.extra) : {};
  const pageToken = extra.page_token;
  const igUserId  = extra.ig_user_id;
  if (!pageToken || !igUserId) return null;

  // Step 1: find the media ID by matching shortcode
  const mediaListRes = await fetch(
    `${GRAPH}/${igUserId}/media?fields=id,shortcode&limit=50&access_token=${pageToken}`,
  );
  if (!mediaListRes.ok) return null;
  const mediaList = await mediaListRes.json<{
    data?: Array<{ id: string; shortcode: string }>;
  }>();

  const media = mediaList.data?.find(m => m.shortcode === shortcode);
  if (!media) return null;

  // Step 2: fetch insights for the matched media
  const insightsRes = await fetch(
    `${GRAPH}/${media.id}/insights?metric=impressions,reach,saved,profile_visits&access_token=${pageToken}`,
  );
  if (!insightsRes.ok) return null;
  const insightsData = await insightsRes.json<{
    data?: Array<{ name: string; values?: Array<{ value: number }>; value?: number }>;
  }>();

  const result: PartialMetrics = {};
  for (const item of insightsData.data ?? []) {
    const val = item.value ?? item.values?.[0]?.value;
    if (val == null) continue;
    if (item.name === 'impressions')    result.impressions = val;
    if (item.name === 'reach')          result.reach       = val;
    if (item.name === 'saved')          result.saves       = val;
    if (item.name === 'profile_visits') result.clicks      = val;
  }
  return result;
}
