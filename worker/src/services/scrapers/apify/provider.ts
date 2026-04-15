import type { NormalizedMetrics, ScraperProvider } from '../interface';
import type { ScraperCredentials } from '../index';
import { ACTOR_MAP } from './actors';
import { runActorSyncItems } from './client';
import { normalizeItems } from './normalizer';

function buildInput(
  platform: string,
  urls: string[],
  credentials?: ScraperCredentials,
): Record<string, unknown> {
  switch (platform) {
    case 'Instagram': {
      const hasReels = urls.some(u => u.includes('/reel/'));
      const hasPosts = urls.some(u => u.includes('/p/'));
      const input: Record<string, unknown> = { directUrls: urls, resultsLimit: urls.length + 5 };
      if (hasReels && !hasPosts) input.resultsType = 'reels';
      else if (hasPosts && !hasReels) input.resultsType = 'posts';
      // mixed: omit resultsType, let actor infer from directUrls
      if (credentials) {
        input.loginType = 'usernamePassword';
        input.loginUsername = credentials.loginUsername;
        input.loginPassword = credentials.loginPassword;
      }
      return input;
    }
    case 'Facebook':
      return { startUrls: urls.map(u => ({ url: u })), maxPosts: urls.length + 5 };
    case 'Twitter':
      return { startUrls: urls.map(u => ({ url: u })), maxItems: urls.length + 5 };
    case 'LinkedIn':
      return { targetUrls: urls, maxPosts: urls.length + 5 };
    case 'YouTube':
      return { videoUrls: urls };
    default:
      return { startUrls: urls.map(u => ({ url: u })) };
  }
}

export class ApifyProvider implements ScraperProvider {
  platform: string;
  supportsBatch = true;
  private token: string;
  private credentials?: ScraperCredentials;

  constructor(platform: string, token: string, credentials?: ScraperCredentials) {
    this.platform = platform;
    this.token = token;
    this.credentials = credentials;
  }

  async scrape(url: string): Promise<NormalizedMetrics | null> {
    const results = await this.batchScrape([url]);
    return results[0] ?? null;
  }

  async batchScrape(urls: string[]): Promise<NormalizedMetrics[]> {
    const actorId = ACTOR_MAP[this.platform];
    if (!actorId) throw new Error(`No actor configured for platform: ${this.platform}`);

    const input = buildInput(this.platform, urls, this.credentials);
    const items = await runActorSyncItems(actorId, input, this.token);
    return normalizeItems(this.platform, items);
  }

  async scrapeProfile(handle: string): Promise<{ followers: number | null }> {
    const actorId = ACTOR_MAP['Instagram'];
    const input: Record<string, unknown> = {
      usernames: [handle],
      resultsType: 'details',
      resultsLimit: 1,
    };
    if (this.credentials) {
      input.loginType = 'usernamePassword';
      input.loginUsername = this.credentials.loginUsername;
      input.loginPassword = this.credentials.loginPassword;
    }
    try {
      const items = await runActorSyncItems<Record<string, unknown>>(actorId!, input, this.token, 256, 60);
      const profile = items[0] ?? null;
      if (!profile) return { followers: null };
      const followers = Number(profile['followersCount'] ?? profile['followers_count'] ?? profile['followers'] ?? NaN);
      return { followers: isNaN(followers) ? null : followers };
    } catch {
      return { followers: null };
    }
  }
}
