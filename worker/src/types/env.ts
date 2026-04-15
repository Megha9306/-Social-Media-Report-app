export interface Env {
  DB: D1Database;
  REPORT_CACHE: KVNamespace;
  EXPORTS_BUCKET?: R2Bucket;
  SCRAPE_QUEUE: Queue<ScrapeJob | CompetitorJob | ProfileScrapeJob | BrandScrapeJob>;
  SCRAPE_STATUS: DurableObjectNamespace;
  SCHEDULER: DurableObjectNamespace;

  // vars
  SMART_SCHEDULE_FRESH_HOURS: string;
  SMART_SCHEDULE_RECENT_HOURS: string;
  SMART_SCHEDULE_OLD_HOURS: string;
  WORKER_URL: string;

  // vars
  APP_URL: string;                    // e.g. http://localhost:3000

  // OAuth — Meta (Instagram + Facebook)
  META_APP_ID: string;
  META_APP_SECRET: string;
  META_REDIRECT_URI: string;

  // OAuth — LinkedIn
  LINKEDIN_CLIENT_ID: string;
  LINKEDIN_CLIENT_SECRET: string;
  LINKEDIN_REDIRECT_URI: string;

  // OAuth — Twitter/X
  TWITTER_CLIENT_ID: string;
  TWITTER_CLIENT_SECRET: string;
  TWITTER_REDIRECT_URI: string;

  // OAuth — YouTube / Google
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;

  // secrets
  APIFY_TOKEN: string;
  API_KEY: string;
  WEBHOOK_SECRET: string;
}

export interface ScrapeJob {
  platform: string;
  urls: string[];
  postIds: string[];
}

export interface CompetitorJob {
  type: 'competitor';
  accountRunId: string;
  handle: string;
  platform: string;   // 'instagram' | 'linkedin' | 'twitter' | 'facebook' | 'youtube'
  runId: string;
  fromDate?: string;
  toDate?: string;
}

export interface ProfileScrapeJob {
  type: 'profile_scrape';
  handle: string;
  postId: string;
}

export interface BrandScrapeJob {
  type: 'brand_scrape';
  brandId: string;
  platform: string;
  profileUrl: string;
  handle: string;
  fromDate?: string;
  toDate?: string;
}
