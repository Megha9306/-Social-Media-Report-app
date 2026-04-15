import { runActorSyncItems } from './client';
import type { CompetitorProfileData, ScrapedPost, ScrapedProfile } from './competitor-profile';

const PAGES_ACTOR = 'apify/facebook-pages-scraper';
const POSTS_ACTOR = 'apify/facebook-posts-scraper';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FacebookPageItem {
  name?: string;
  title?: string;
  pageName?: string;
  likes?: number;
  followers?: number;
  followersCount?: number;
  pageFollowers?: number;
  profilePicture?: string;
  photo?: string;
  posts?: FacebookEmbeddedPost[];
}

interface FacebookEmbeddedPost {
  url?: string;
  postUrl?: string;
  text?: string;
  time?: string;
  timestamp?: string;
  likes?: number;
  comments?: number | { count?: number };
  shares?: number | { count?: number };
  videoViewCount?: number;
}

interface FacebookPostItem {
  url?: string;
  postUrl?: string;
  text?: string;
  message?: string;
  time?: string;
  timestamp?: string;
  reactions?: Record<string, number>;
  likes?: number;
  likesCount?: number;
  comments?: number | { count?: number };
  commentsCount?: number;
  shares?: number | { count?: number };
  sharesCount?: number;
  videoViewCount?: number;
  viewsCount?: number;
}

// ─── URL helpers ─────────────────────────────────────────────────────────────

export function isFacebookUrl(raw: string): boolean {
  const h = raw.trim().toLowerCase().replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  return h.startsWith('facebook.com/') || h.startsWith('fb.com/');
}

export function normalizeFacebookHandle(raw: string): string {
  let h = raw.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  if (h.startsWith('facebook.com/') || h.startsWith('fb.com/')) {
    // Take only facebook.com/pagename (2 parts)
    const parts = h.split('/').filter(Boolean);
    return parts.slice(0, 2).join('/');
  }
  return `facebook.com/${h}`;
}

function pageUrl(handle: string): string {
  return `https://www.${handle}`;
}

// ─── Post parsers ─────────────────────────────────────────────────────────────

function parseEmbeddedPosts(
  items: FacebookEmbeddedPost[],
  fromTs: number,
  toTs: number,
): ScrapedPost[] {
  return items
    .map(item => {
      const ts = item.time ? new Date(item.time).getTime()
        : item.timestamp ? new Date(item.timestamp).getTime() : null;
      const comments = typeof item.comments === 'number' ? item.comments
        : (item.comments as { count?: number } | undefined)?.count ?? 0;
      const shares = typeof item.shares === 'number' ? item.shares
        : (item.shares as { count?: number } | undefined)?.count ?? 0;
      const likes = item.likes ?? 0;
      return {
        postIdExternal: null,
        postUrl:        item.url ?? item.postUrl ?? null,
        postType:       'Post',
        publishedAt:    item.time ?? item.timestamp ?? null,
        caption:        item.text ?? null,
        likes,
        comments,
        views:          item.videoViewCount ?? null,
        engagement:     likes + comments,
        _ts:            ts,
      };
    })
    .filter(p => p._ts === null || (p._ts >= fromTs && p._ts <= toTs))
    .map(({ _ts, ...post }) => post);
}

function parsePostItems(
  items: FacebookPostItem[],
  fromTs: number,
  toTs: number,
): ScrapedPost[] {
  return items
    .map(item => {
      const ts = item.time ? new Date(item.time).getTime()
        : item.timestamp ? new Date(item.timestamp).getTime() : null;

      const reactions = item.reactions;
      let likes: number;
      if (reactions && typeof reactions === 'object') {
        const total = Object.values(reactions).reduce((s, v) => s + (Number(v) || 0), 0);
        likes = total > 0 ? total : (item.likes ?? item.likesCount ?? 0);
      } else {
        likes = item.likes ?? item.likesCount ?? 0;
      }

      const comments = typeof item.comments === 'number' ? item.comments
        : (item.comments as { count?: number } | undefined)?.count ?? item.commentsCount ?? 0;
      const shares = typeof item.shares === 'number' ? item.shares
        : (item.shares as { count?: number } | undefined)?.count ?? item.sharesCount ?? 0;

      return {
        postIdExternal: null,
        postUrl:        item.url ?? item.postUrl ?? null,
        postType:       'Post',
        publishedAt:    item.time ?? item.timestamp ?? null,
        caption:        item.text ?? item.message ?? null,
        likes,
        comments,
        views:          item.videoViewCount ?? item.viewsCount ?? null,
        engagement:     likes + comments,
        _ts:            ts,
      };
    })
    .filter(p => p._ts === null || (p._ts >= fromTs && p._ts <= toTs))
    .map(({ _ts, ...post }) => post);
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function scrapeFacebookCompetitorProfile(
  rawHandle: string,
  token: string,
  fromDate?: string,
  toDate?: string,
): Promise<CompetitorProfileData> {
  const handle = normalizeFacebookHandle(rawHandle);
  const from = fromDate ?? new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10);
  const to   = toDate   ?? new Date().toISOString().slice(0, 10);

  const fromTs = new Date(from).getTime();
  const toTs   = new Date(to).getTime() + 86_400_000;

  // Scrape page metadata + embedded posts via facebook-pages-scraper
  const pageItems = await runActorSyncItems<FacebookPageItem>(
    PAGES_ACTOR,
    {
      startUrls: [{ url: pageUrl(handle) }],
      maxPosts:  200,
    },
    token,
    512,
    300,
  );

  const page = pageItems[0] ?? {};
  const followers =
    page.followers ?? page.followersCount ?? page.pageFollowers ?? page.likes ?? null;

  const profile: ScrapedProfile = {
    username:      handle,
    followers,
    following:     null,
    profilePicUrl: page.profilePicture ?? page.photo ?? null,
  };

  // Use embedded posts if available; otherwise run a separate posts scrape
  const embedded = page.posts ?? [];
  const posts: ScrapedPost[] = embedded.length > 0
    ? parseEmbeddedPosts(embedded, fromTs, toTs)
    : await (async () => {
        const postItems = await runActorSyncItems<FacebookPostItem>(
          POSTS_ACTOR,
          { startUrls: [{ url: pageUrl(handle) }], maxPosts: 200 },
          token,
          512,
          300,
        );
        return parsePostItems(postItems, fromTs, toTs);
      })();

  return { profile, posts };
}
