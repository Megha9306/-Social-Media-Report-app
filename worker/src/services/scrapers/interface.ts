export interface NormalizedMetrics {
  url: string;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  views?: number;
  others?: number;
  publishedAt?: string; // ISO date
  caption?: string;
  // Instagram-specific owner/collaboration fields
  ownerUsername?: string;
  coauthorHandles?: string[];
  taggedUserHandles?: string[];
}

export interface ScraperProvider {
  platform: string;
  supportsBatch: boolean;
  scrape(url: string): Promise<NormalizedMetrics | null>;
  batchScrape(urls: string[]): Promise<NormalizedMetrics[]>;
}
