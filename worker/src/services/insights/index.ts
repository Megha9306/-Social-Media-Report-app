import type { D1Database } from '@cloudflare/workers-types';
import {
  getConnectedAccountsByPlatform,
  updateMetricsFromApi,
  type ConnectedAccount,
} from '../../db/queries';
import { getInstagramInsights } from './meta-instagram';
import { getFacebookInsights } from './meta-facebook';
import { getLinkedInInsights } from './linkedin';
import { getTwitterInsights } from './twitter';
import { getYouTubeInsights } from './youtube';
import type { PartialMetrics } from './meta-instagram';

// ─── Platform → canonical name used in connected_accounts table ───────────────

const PLATFORM_MAP: Record<string, string> = {
  instagram: 'Instagram',
  facebook:  'Facebook',
  twitter:   'Twitter',
  linkedin:  'LinkedIn',
  youtube:   'YouTube',
};

// ─── Insight provider dispatch ────────────────────────────────────────────────

async function callProvider(
  platform: string,
  postUrl: string,
  account: ConnectedAccount,
): Promise<PartialMetrics | null> {
  switch (platform.toLowerCase()) {
    case 'instagram': return getInstagramInsights(postUrl, account);
    case 'facebook':  return getFacebookInsights(postUrl, account);
    case 'linkedin':  return getLinkedInInsights(postUrl, account);
    case 'twitter':   return getTwitterInsights(postUrl, account);
    case 'youtube':   return getYouTubeInsights(postUrl, account);
    default:          return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface PostRecord {
  id: string;
  platform: string;       // e.g. 'instagram' | 'facebook' | 'twitter' | 'linkedin' | 'youtube'
  url: string | null;
}

/**
 * Fetch official API metrics for a single scraped post and merge them into
 * the database. This is called non-blocking (wrapped in try/catch at the call
 * site) so it never fails a scrape job.
 *
 * Returns true if at least one metric was updated, false otherwise.
 */
export async function fetchAndMergeInsights(
  post: PostRecord,
  db: D1Database,
): Promise<boolean> {
  if (!post.url) return false;

  const canonicalPlatform = PLATFORM_MAP[post.platform.toLowerCase()];
  if (!canonicalPlatform) return false;

  // Look up connected accounts for this platform
  const accounts = await getConnectedAccountsByPlatform(db, canonicalPlatform);
  if (accounts.length === 0) return false;

  // Try each connected account until one returns insights
  for (const account of accounts) {
    let insights: PartialMetrics | null = null;
    try {
      insights = await callProvider(post.platform, post.url, account);
    } catch {
      continue;  // try next account
    }
    if (!insights) continue;

    // At least one metric returned — merge into DB and stop
    const hasData =
      insights.impressions != null ||
      insights.reach        != null ||
      insights.saves        != null ||
      insights.clicks       != null;

    if (hasData) {
      await updateMetricsFromApi(db, post.id, insights);
      return true;
    }
  }

  return false;
}
