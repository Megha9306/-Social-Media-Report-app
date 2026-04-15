import { runActorSyncItems } from './client';
import type { CompetitorProfileData, ScrapedPost, ScrapedProfile } from './competitor-profile';

const PERSONAL_ACTOR = 'harvestapi/linkedin-profile-posts';   // /in/ profiles
const COMPANY_ACTOR  = 'apimaestro/linkedin-company-posts';   // /company/ pages

// ─── URL helpers ─────────────────────────────────────────────────────────────

export function isLinkedInUrl(raw: string): boolean {
  const h = raw.trim().toLowerCase().replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  return h.startsWith('linkedin.com/');
}

function isCompanyUrl(raw: string): boolean {
  const h = raw.trim().toLowerCase().replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  return h.includes('linkedin.com/company/');
}

// Normalise to canonical path: linkedin.com/company/slug  or  linkedin.com/in/slug
export function normalizeLinkedInHandle(raw: string): string {
  let h = raw.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  if (!h.toLowerCase().includes('linkedin.com/')) throw new Error(`Not a LinkedIn URL: ${raw}`);
  const parts = h.split('/').filter(Boolean);
  return parts.slice(0, 3).join('/');   // ['linkedin.com', 'company'|'in', 'slug']
}

function profileUrl(handle: string): string {
  return `https://www.${handle}/`;
}

// ─── Types: apimaestro/linkedin-company-posts ─────────────────────────────────

interface CompanyPostItem {
  activity_urn?: string;
  full_urn?: string;
  post_url?: string;
  text?: string;
  post_type?: string;
  posted_at?: {
    date?: string;
    timestamp?: number;
  };
  stats?: {
    total_reactions?: number;
    comments?: number;
    reposts?: number;
    [key: string]: number | undefined;
  };
  author?: {
    follower_count?: number;
    logo_url?: string;
  };
}

// ─── Types: harvestapi/linkedin-profile-posts ─────────────────────────────────

interface PersonalPostItem {
  id?: string;
  postId?: string;
  linkedinUrl?: string;
  url?: string;
  text?: string;
  commentary?: string;
  post_type?: string;
  numLikes?: number;
  numComments?: number;
  numImpressions?: number;
  createdAt?: string;
  createdAtTimestamp?: number;
  postedAt?: { date?: string };
  postedDate?: string;
  engagement?: { likes?: number; comments?: number };
}

// ─── Company page scraper ─────────────────────────────────────────────────────

async function scrapeCompanyPosts(
  handle: string,
  fromDate: string,
  toDate: string,
  token: string,
): Promise<{ posts: ScrapedPost[]; profile: ScrapedProfile }> {
  const url = profileUrl(handle);
  console.log(`[LinkedIn Company] Scraping: ${url}`);

  // Actor ignores companyUrl and uses company_name (the slug) as the actual lookup key
  const slug = handle.split('/').pop() ?? handle;  // e.g. 'linkedin.com/company/druva' → 'druva'

  const items = await runActorSyncItems<CompanyPostItem>(
    COMPANY_ACTOR,
    {
      companyUrl:   url,
      company_name: slug,   // required: actor uses this as the actual lookup key
      limit:        100,    // actor max is 100 per call
      sort:         'recent',
    },
    token,
    512,
    300,
  );

  console.log(`[LinkedIn Company] Actor returned ${items.length} raw items`);

  const fromTs = new Date(fromDate).getTime();
  const toTs   = new Date(toDate).getTime() + 86_400_000;

  // Extract follower count and profile pic from first item's author
  const firstAuthor = items[0]?.author;
  const profile: ScrapedProfile = {
    username:      handle,
    followers:     firstAuthor?.follower_count ?? null,
    following:     null,
    profilePicUrl: firstAuthor?.logo_url ?? null,
  };

  const posts: ScrapedPost[] = items
    .map(item => {
      const ts = item.posted_at?.timestamp ?? (item.posted_at?.date ? new Date(item.posted_at.date).getTime() : null);
      const publishedAt = item.posted_at?.timestamp
        ? new Date(item.posted_at.timestamp).toISOString()
        : item.posted_at?.date ?? null;

      const likes    = item.stats?.total_reactions ?? 0;
      const comments = item.stats?.comments ?? 0;

      return {
        postIdExternal: item.activity_urn ?? item.full_urn ?? null,
        postUrl:        item.post_url ?? null,
        postType:       item.post_type ?? 'Post',
        publishedAt,
        caption:        item.text ?? null,
        likes,
        comments,
        views:          null,   // LinkedIn company API doesn't expose impressions
        engagement:     likes + comments,
        _ts:            ts,
      };
    })
    .filter(p => p._ts === null || (p._ts >= fromTs && p._ts <= toTs))
    .map(({ _ts, ...post }) => post);

  return { posts, profile };
}

// ─── Personal profile scraper ─────────────────────────────────────────────────

async function scrapePersonalPosts(
  handle: string,
  fromDate: string,
  toDate: string,
  token: string,
): Promise<ScrapedPost[]> {
  const url = profileUrl(handle);
  console.log(`[LinkedIn Personal] Scraping: ${url}`);

  const items = await runActorSyncItems<PersonalPostItem>(
    PERSONAL_ACTOR,
    {
      profileUrls: [url],
      maxPosts:    200,
    },
    token,
    512,
    300,
  );

  console.log(`[LinkedIn Personal] Actor returned ${items.length} raw items`);

  const fromTs = new Date(fromDate).getTime();
  const toTs   = new Date(toDate).getTime() + 86_400_000;

  return items
    .map(item => {
      const rawTs = item.createdAtTimestamp ?? (item.createdAt ? new Date(item.createdAt).getTime() : null);
      const publishedAt = item.createdAt ?? item.postedAt?.date ?? item.postedDate ?? null;

      const likes    = item.numLikes    ?? item.engagement?.likes    ?? 0;
      const comments = item.numComments ?? item.engagement?.comments ?? 0;
      const views    = item.numImpressions ?? null;

      return {
        postIdExternal: item.id ?? item.postId ?? null,
        postUrl:        item.linkedinUrl ?? item.url ?? null,
        postType:       'Post',
        publishedAt,
        caption:        item.text ?? item.commentary ?? null,
        likes,
        comments,
        views,
        engagement:     likes + comments,
        _ts:            rawTs,
      };
    })
    .filter(p => p._ts === null || (p._ts >= fromTs && p._ts <= toTs))
    .map(({ _ts, ...post }) => post);
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function scrapeLinkedInCompetitorProfile(
  rawHandle: string,
  token: string,
  fromDate?: string,
  toDate?: string,
): Promise<CompetitorProfileData> {
  const handle = normalizeLinkedInHandle(rawHandle);
  const from = fromDate ?? new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10);
  const to   = toDate   ?? new Date().toISOString().slice(0, 10);

  if (isCompanyUrl(rawHandle)) {
    // Company page: use apimaestro/linkedin-company-posts (includes follower count)
    const { posts, profile } = await scrapeCompanyPosts(handle, from, to, token);
    return { profile, posts };
  } else {
    // Personal profile: use harvestapi/linkedin-profile-posts
    const posts = await scrapePersonalPosts(handle, from, to, token);
    const profile: ScrapedProfile = {
      username:      handle,
      followers:     null,
      following:     null,
      profilePicUrl: null,
    };
    return { profile, posts };
  }
}
