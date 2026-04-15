import type { ScraperProvider } from './interface';
import { ApifyProvider } from './apify/provider';

export interface ScraperCredentials {
  loginUsername: string;
  loginPassword: string;
}

export function getProvider(
  platform: string,
  apifyToken: string,
  credentials?: ScraperCredentials,
): ScraperProvider {
  return new ApifyProvider(platform, apifyToken, credentials);
}

export type { ScraperProvider, NormalizedMetrics } from './interface';
