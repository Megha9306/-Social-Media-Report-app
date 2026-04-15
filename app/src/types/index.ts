export type Platform = 'Instagram' | 'Facebook' | 'Twitter' | 'LinkedIn' | 'YouTube';
export type Format   = 'Static' | 'Carousel' | 'Gif' | 'Reel' | 'Video Post' | 'Story' | 'Article';
export type ScrapeStatus = 'pending' | 'success' | 'failed' | 'post_deleted' | 'expired';

export type PostTypeCategory = 'own_post' | 'collab' | 'tagged' | 'non_tagged';

export interface Post {
  id: string;
  platform: Platform;
  content_bucket: string | null;
  sub_bucket: string | null;
  campaign: string | null;
  tags: string | null;
  format: Format;
  post_url: string;
  post_url_normalized: string;
  post_id_external: string | null;
  post_published_at: string | null;
  lock: number;
  scrape_status: ScrapeStatus;
  last_error: string | null;
  fail_count: number;
  next_scrape_at: string;
  created_at: string;
  updated_at: string;
  post_type_category: PostTypeCategory | null;
  uploader_handle: string | null;
  uploader_followers: number | null;
  brand_id: string | null;
  tagged: number;            // 0 or 1
  data_origin: 'manual' | 'scraped';
}

export interface PostMetrics {
  id: string;
  post_id: string;
  scraped_at: string | null;
  month_date: string | null;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  views: number;
  others: number;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  ctr: number | null;
  vtr: number | null;
  active_eng: number | null;
  active_eng_rate: number | null;
  passive_eng: number | null;
  passive_eng_rate: number | null;
  likes_source: string;
  comments_source: string;
  shares_source: string;
  saves_source: string;
  views_source: string;
  impressions_source: string;
  reach_source: string;
  clicks_source: string;
  data_source: string;
}

export interface PostWithMetrics extends Post {
  metrics: PostMetrics | null;
  story_expires_at: string | null;
  brand_name: string | null;
}

export interface MetricsSnapshot {
  id: string;
  post_id: string;
  scraped_at: string;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  views: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
}

export interface ReportTotals {
  totalPosts: number;
  totalReach: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalSaves: number;
  totalViews: number;
  totalImpressions: number;
  totalClicks: number;
  totalActiveEng: number;
  totalPassiveEng: number;
  avgEngRate: number | null;
  scrapedToday: number;
}

export interface Filters {
  platform?: string;
  format?: string;
  content_bucket?: string;
  campaign?: string;
  date_from?: string;
  date_to?: string;
  brand_id?: string;
  tagged?: boolean;
  data_origin?: 'manual' | 'scraped';
  tags?: string;
}

export type BrandScrapeStatus = 'idle' | 'scraping' | 'completed' | 'failed';

export interface Brand {
  id: string;
  name: string;
  platform: 'Instagram' | 'Facebook' | 'LinkedIn';
  profile_url: string;
  handle: string | null;
  followers: number | null;
  total_posts: number;
  tagged_posts: number;
  non_tagged_posts: number;
  total_reach: number;
  avg_eng_rate: number | null;
  last_scraped: string | null;
  scrape_status: BrandScrapeStatus;
  created_at: string;
  updated_at: string;
}

export interface ScrapeStatusEvent {
  type: 'scraping' | 'completed' | 'failed';
  postIds: string[];
  data?: Record<string, unknown>;
  timestamp: string;
}
