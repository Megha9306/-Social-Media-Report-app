import type { ConnectedAccount } from '../../db/queries';
import type { PartialMetrics } from './meta-instagram';

// ─── URL parsing ──────────────────────────────────────────────────────────────

function extractTweetId(postUrl: string): string | null {
  // twitter.com/{user}/status/{tweet_id}
  // x.com/{user}/status/{tweet_id}
  const m = postUrl.match(/\/status\/(\d+)/);
  return m?.[1] ?? null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function getTwitterInsights(
  postUrl: string,
  account: ConnectedAccount,
): Promise<PartialMetrics | null> {
  const tweetId = extractTweetId(postUrl);
  if (!tweetId) return null;

  // non_public_metrics requires OAuth 2.0 user context (the connected account token)
  const res = await fetch(
    `https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=non_public_metrics,public_metrics`,
    { headers: { Authorization: `Bearer ${account.access_token}` } },
  );
  if (!res.ok) return null;

  const data = await res.json<{
    data?: {
      non_public_metrics?: {
        impression_count?: number;
        url_link_clicks?: number;
        user_profile_clicks?: number;
      };
      public_metrics?: {
        like_count?: number;
        retweet_count?: number;
      };
    };
  }>();

  const npm = data.data?.non_public_metrics;
  if (!npm) return null;

  return {
    impressions: npm.impression_count,
    clicks:      npm.url_link_clicks,
  };
}
