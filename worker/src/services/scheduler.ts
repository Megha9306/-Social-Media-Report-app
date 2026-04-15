import type { Post } from '../db/queries';
import type { PostMetrics } from '../db/queries';

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return ms / (1000 * 60 * 60 * 24);
}

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

export const STORY_EXPIRED_SENTINEL = 'EXPIRED';

export function calculateNextScrape(
  post: Post,
  currentMetrics?: PostMetrics | null,
  previousMetrics?: PostMetrics | null
): string {
  // Stories: scrape every 2h, expire after 24h
  if (post.format === 'Story') {
    const ageInHours = daysSince(post.created_at) * 24;
    if (ageInHours >= 24) return STORY_EXPIRED_SENTINEL;
    return hoursFromNow(2);
  }

  const ageInDays = daysSince(post.post_published_at ?? post.created_at);

  // Viral detection: metrics jumped >50% since last scrape
  if (currentMetrics && previousMetrics) {
    const prev = (previousMetrics.active_eng ?? 0);
    const curr = (currentMetrics.active_eng ?? 0);
    if (prev > 0) {
      const growth = (curr - prev) / prev;
      if (growth > 0.5) return hoursFromNow(4);
    }
  }

  if (ageInDays < 7)  return hoursFromNow(4);   // Fresh: every 4 hours
  if (ageInDays < 30) return hoursFromNow(24);   // Recent: once daily
  return hoursFromNow(168);                       // Old: once weekly
}

/**
 * Group a flat list of posts by platform, then chunk each platform's URLs
 * into batches of `batchSize`. Returns an array of {platform, urls, postIds}.
 */
export function groupIntoBatches(
  posts: Post[],
  batchSize = 50
): Array<{ platform: string; urls: string[]; postIds: string[] }> {
  const byPlatform = new Map<string, { urls: string[]; postIds: string[] }>();

  for (const post of posts) {
    if (!byPlatform.has(post.platform)) {
      byPlatform.set(post.platform, { urls: [], postIds: [] });
    }
    const group = byPlatform.get(post.platform)!;
    group.urls.push(post.post_url);
    group.postIds.push(post.id);
  }

  const batches: Array<{ platform: string; urls: string[]; postIds: string[] }> = [];
  for (const [platform, { urls, postIds }] of byPlatform) {
    for (let i = 0; i < urls.length; i += batchSize) {
      batches.push({
        platform,
        urls: urls.slice(i, i + batchSize),
        postIds: postIds.slice(i, i + batchSize),
      });
    }
  }
  return batches;
}
