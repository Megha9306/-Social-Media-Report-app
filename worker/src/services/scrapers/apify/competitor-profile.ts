import { runActorSyncItems } from './client';

const INSTAGRAM_ACTOR = 'apify/instagram-scraper';

// Apify actor resource limits — adjust these if runs timeout or hit memory limits
const PROFILE_MEMORY_MB  = 256;
const PROFILE_TIMEOUT_S  = 120;
const POSTS_MEMORY_MB    = 512;
const POSTS_TIMEOUT_S    = 300;

// ─── Types returned by Apify instagram-scraper ────────────────────────────────

interface ApifyProfileItem {
  id?: string;
  username?: string;
  fullName?: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
  profilePicUrl?: string;
  biography?: string;
  verified?: boolean;
  isPrivate?: boolean;
}

interface ApifyPostItem {
  id?: string;
  shortCode?: string;
  url?: string;
  type?: string;       // 'Image' | 'Video' | 'Sidecar'
  caption?: string;
  likesCount?: number;
  commentsCount?: number;
  videoPlayCount?: number;
  videoViewCount?: number;
  timestamp?: string;
  ownerUsername?: string;
}

export interface ScrapedProfile {
  username: string;
  followers: number | null;
  following: number | null;
  profilePicUrl: string | null;
}

export interface ScrapedPost {
  postIdExternal: string | null;
  postUrl: string | null;
  postType: string | null;
  publishedAt: string | null;
  caption: string | null;
  likes: number;
  comments: number;
  views: number | null;
  engagement: number;
}

export interface CompetitorProfileData {
  profile: ScrapedProfile;
  posts: ScrapedPost[];
}

// ─── Normalise a raw handle to a plain username ───────────────────────────────

export function normalizeHandle(raw: string): string {
  // strip @ prefix
  let h = raw.trim().replace(/^@/, '');
  // strip full URL prefixes
  h = h.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '');
  // strip trailing slash or path
  h = h.split('/')[0] ?? h;
  return h.toLowerCase();
}

// ─── Build canonical profile URL ─────────────────────────────────────────────

function profileUrl(username: string): string {
  return `https://www.instagram.com/${username}/`;
}

// ─── Scrape profile details (followers, following, etc.) ─────────────────────

async function scrapeProfileDetails(username: string, token: string): Promise<ScrapedProfile> {
  const items = await runActorSyncItems<ApifyProfileItem>(
    INSTAGRAM_ACTOR,
    {
      directUrls: [profileUrl(username)],
      resultsType: 'details',
      resultsLimit: 1,
    },
    token,
    PROFILE_MEMORY_MB,
    PROFILE_TIMEOUT_S,
  );

  const item = items[0] ?? {};
  return {
    username,
    followers: item.followersCount ?? null,
    following: item.followsCount ?? null,
    profilePicUrl: item.profilePicUrl ?? null,
  };
}

// ─── Scrape posts within a date range from a profile ─────────────────────────

async function scrapeProfilePosts(username: string, fromDate: string, toDate: string, token: string): Promise<ScrapedPost[]> {
  const items = await runActorSyncItems<ApifyPostItem>(
    INSTAGRAM_ACTOR,
    {
      directUrls: [profileUrl(username)],
      resultsType: 'posts',
      resultsLimit: 500,
      onlyPostsNewerThan: fromDate,
    },
    token,
    POSTS_MEMORY_MB,
    POSTS_TIMEOUT_S,
  );

  // Filter out posts beyond the toDate (client-side, since Apify doesn't support an end-date param)
  const toTs = new Date(toDate).getTime() + 86_400_000; // inclusive of toDate day
  return items
    .filter(item => !item.timestamp || new Date(item.timestamp).getTime() <= toTs)
    .map(item => {
      const likes    = item.likesCount ?? 0;
      const comments = item.commentsCount ?? 0;
      const views    = item.videoPlayCount ?? item.videoViewCount ?? null;
      return {
        postIdExternal: item.shortCode ?? item.id ?? null,
        postUrl:        item.url ?? null,
        postType:       item.type ?? null,
        publishedAt:    item.timestamp ?? null,
        caption:        item.caption ?? null,
        likes,
        comments,
        views,
        engagement: likes + comments,
      };
    });
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function scrapeCompetitorProfile(
  rawHandle: string,
  token: string,
  fromDate?: string,
  toDate?: string,
): Promise<CompetitorProfileData> {
  const username = normalizeHandle(rawHandle);

  const from = fromDate ?? new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10);
  const to   = toDate   ?? new Date().toISOString().slice(0, 10);

  // Run profile details and posts scrapes in parallel
  const [profile, posts] = await Promise.all([
    scrapeProfileDetails(username, token),
    scrapeProfilePosts(username, from, to, token),
  ]);

  return { profile, posts };
}
