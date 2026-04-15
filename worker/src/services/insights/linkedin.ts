import type { ConnectedAccount } from '../../db/queries';
import type { PartialMetrics } from './meta-instagram';

const API = 'https://api.linkedin.com/v2';

// ─── URL parsing ──────────────────────────────────────────────────────────────

function extractActivityId(postUrl: string): string | null {
  // linkedin.com/feed/update/urn:li:activity:{id}
  // linkedin.com/posts/{slug}-activity-{id}-{suffix}
  const activityPattern = /activity[:-](\d+)/i;
  const m = postUrl.match(activityPattern);
  return m?.[1] ?? null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function getLinkedInInsights(
  postUrl: string,
  account: ConnectedAccount,
): Promise<PartialMetrics | null> {
  const activityId = extractActivityId(postUrl);
  if (!activityId) return null;

  const extra: Record<string, string> = account.extra ? JSON.parse(account.extra) : {};
  // Works for both personal profiles (urn:li:person:{id}) and org pages (urn:li:organization:{org_id})
  const orgId  = extra.org_id;
  const urn    = extra.urn;
  const shareUrn = `urn:li:share:${activityId}`;
  const accessToken = account.access_token;

  if (orgId) {
    // Organization post stats
    const orgUrn = `urn:li:organization:${orgId}`;
    const params = new URLSearchParams({
      q:                    'organizationalEntity',
      organizationalEntity: orgUrn,
      'shares[0]':          shareUrn,
    });
    const res = await fetch(`${API}/organizationalEntityShareStatistics?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json<{
      elements?: Array<{
        totalShareStatistics?: {
          impressionCount?: number;
          clickCount?: number;
          likeCount?: number;
        };
      }>;
    }>();
    const stats = data.elements?.[0]?.totalShareStatistics;
    if (!stats) return null;
    return {
      impressions: stats.impressionCount,
      clicks:      stats.clickCount,
    };
  }

  if (urn) {
    // Personal share stats
    const params = new URLSearchParams({
      q:       'shares',
      shares:  shareUrn,
    });
    const res = await fetch(`${API}/socialActions/${encodeURIComponent(shareUrn)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    // socialActions returns like/comment counts; impressions only available for org pages
    // Return null rather than partial data that may mislead
    return null;
  }

  return null;
}
