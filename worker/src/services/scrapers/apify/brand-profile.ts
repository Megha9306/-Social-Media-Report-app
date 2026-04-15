import { runActorSyncItems } from './client';
import { scrapeCompetitorProfile, normalizeHandle } from './competitor-profile';
import { normalizeLinkedInHandle, scrapeLinkedInCompetitorProfile } from './linkedin-competitor-profile';

// ─── Output Types ─────────────────────────────────────────────────────────────

export interface BrandPost {
  postUrl: string;
  postIdExternal: string | null;
  format: 'Static' | 'Carousel' | 'Reel' | 'Video Post' | 'Story' | 'Article';
  caption: string | null;
  publishedAt: string | null;
  likes: number;
  comments: number;
  views: number | null;
  shares: number | null;
}

export interface BrandProfileData {
  name: string | null;
  handle: string;
  followers: number | null;
  posts: BrandPost[];
}

// ─── Instagram ────────────────────────────────────────────────────────────────

function mapInstagramType(type: string | null): BrandPost['format'] {
  if (!type) return 'Static';
  const t = type.toLowerCase();
  if (t === 'video') return 'Reel';
  if (t === 'sidecar') return 'Carousel';
  return 'Static';
}

async function scrapeInstagramBrand(profileUrl: string, token: string, fromDate?: string, toDate?: string): Promise<BrandProfileData> {
  const handle = normalizeHandle(profileUrl);
  const data = await scrapeCompetitorProfile(handle, token, fromDate, toDate);
  return {
    name: null,
    handle,
    followers: data.profile.followers,
    posts: data.posts.map(p => ({
      postUrl:        p.postUrl ?? `https://www.instagram.com/p/${p.postIdExternal}/`,
      postIdExternal: p.postIdExternal,
      format:         mapInstagramType(p.postType),
      caption:        p.caption,
      publishedAt:    p.publishedAt,
      likes:          p.likes,
      comments:       p.comments,
      views:          p.views,
      shares:         null,
    })),
  };
}

// ─── Facebook ─────────────────────────────────────────────────────────────────

interface ApifyFbPageItem {
  name?: string;
  likes?: number;
  followers?: number;
  posts?: Array<{
    postId?: string;
    url?: string;
    message?: string;
    time?: string;
    likes?: number;
    comments?: number;
    shares?: number;
    video?: { viewCount?: number };
  }>;
}

async function scrapeFacebookBrand(profileUrl: string, token: string): Promise<BrandProfileData> {
  const items = await runActorSyncItems<ApifyFbPageItem>(
    'apify/facebook-pages-scraper',
    { startUrls: [{ url: profileUrl }] },
    token,
    256,
    120,
  );

  const page = items[0] ?? {};
  const posts: BrandPost[] = (page.posts ?? []).map(p => ({
    postUrl:        p.url ?? '',
    postIdExternal: p.postId ?? null,
    format:         p.video ? 'Video Post' : 'Static',
    caption:        p.message ?? null,
    publishedAt:    p.time ?? null,
    likes:          p.likes ?? 0,
    comments:       p.comments ?? 0,
    views:          p.video?.viewCount ?? null,
    shares:         p.shares ?? null,
  }));

  return {
    name:      page.name ?? null,
    handle:    profileUrl.replace(/^https?:\/\/(www\.)?facebook\.com\//i, '').replace(/\/$/, ''),
    followers: page.followers ?? page.likes ?? null,
    posts,
  };
}

// ─── LinkedIn ─────────────────────────────────────────────────────────────────

function mapLinkedInType(type: string | null, postUrl: string | null): BrandPost['format'] {
  const t = type?.toLowerCase() ?? '';
  if (t.includes('video')) return 'Video Post';
  if (postUrl?.includes('/pulse/')) return 'Article';
  return 'Static';
}

async function scrapeLinkedInBrand(profileUrl: string, token: string, fromDate?: string, toDate?: string): Promise<BrandProfileData> {
  const data = await scrapeLinkedInCompetitorProfile(profileUrl, token, fromDate, toDate);
  const normalizedHandle = normalizeLinkedInHandle(profileUrl);
  const handle = normalizedHandle.split('/').pop() ?? normalizedHandle;

  const posts: BrandPost[] = data.posts
    .filter((p): p is typeof p & { postUrl: string } => Boolean(p.postUrl))
    .map(p => ({
      postUrl:        p.postUrl,
      postIdExternal: p.postIdExternal,
      format:         mapLinkedInType(p.postType, p.postUrl),
      caption:        p.caption,
      publishedAt:    p.publishedAt,
      likes:          p.likes,
      comments:       p.comments,
      views:          p.views,
      shares:         null,
    }));

  return {
    name:      null,
    handle,
    followers: data.profile.followers,
    posts,
  };
}

// ─── Main entry ───────────────────────────────────────────────────────────────

export async function scrapeBrandProfile(
  platform: string,
  profileUrl: string,
  _handle: string,
  token: string,
  fromDate?: string,
  toDate?: string,
): Promise<BrandProfileData> {
  switch (platform) {
    case 'Instagram': return scrapeInstagramBrand(profileUrl, token, fromDate, toDate);
    case 'Facebook':  return scrapeFacebookBrand(profileUrl, token);
    case 'LinkedIn':  return scrapeLinkedInBrand(profileUrl, token, fromDate, toDate);
    default: throw new Error(`Unsupported brand platform: ${platform}`);
  }
}
