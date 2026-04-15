import type { ConnectedAccount } from '../../db/queries';
import type { PartialMetrics } from './meta-instagram';

// ─── URL parsing ──────────────────────────────────────────────────────────────

function extractVideoId(postUrl: string): string | null {
  // youtube.com/watch?v={id}
  // youtu.be/{id}
  // youtube.com/shorts/{id}
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /\/shorts\/([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = postUrl.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function getYouTubeInsights(
  postUrl: string,
  account: ConnectedAccount,
): Promise<PartialMetrics | null> {
  const videoId = extractVideoId(postUrl);
  if (!videoId) return null;

  const extra: Record<string, string> = account.extra ? JSON.parse(account.extra) : {};
  const channelId = extra.channel_id;

  // YouTube Analytics API
  const params = new URLSearchParams({
    ids:        `channel==${channelId ?? 'MINE'}`,
    startDate:  '2000-01-01',
    endDate:    new Date().toISOString().slice(0, 10),
    metrics:    'views,estimatedMinutesWatched,likes,comments',
    filters:    `video==${videoId}`,
    dimensions: 'video',
  });

  const res = await fetch(
    `https://youtubeanalytics.googleapis.com/v2/reports?${params}`,
    { headers: { Authorization: `Bearer ${account.access_token}` } },
  );
  if (!res.ok) return null;

  const data = await res.json<{
    columnHeaders?: Array<{ name: string }>;
    rows?: Array<Array<number | string>>;
  }>();

  if (!data.rows?.length || !data.columnHeaders?.length) return null;

  const headers = data.columnHeaders.map(h => h.name);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const row     = data.rows[0]!;

  const get = (name: string): number | undefined => {
    const idx = headers.indexOf(name);
    if (idx < 0) return undefined;
    const val = row[idx];
    return typeof val === 'number' ? val : Number(val) || undefined;
  };

  return {
    impressions: get('views'),
  };
}
