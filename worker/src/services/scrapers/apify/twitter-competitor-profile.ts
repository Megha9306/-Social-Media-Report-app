import { runActorSyncItems } from './client';
import type { CompetitorProfileData, ScrapedPost, ScrapedProfile } from './competitor-profile';

const TWITTER_ACTOR = 'apidojo/tweet-scraper';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TwitterAuthor {
  userName?: string;
  screen_name?: string;
  name?: string;
  followers_count?: number;
  followersCount?: number;
  profile_image_url_https?: string;
  profile_image_url?: string;
}

interface TwitterItem {
  url?: string;
  tweetUrl?: string;
  tweet_url?: string;
  full_text?: string;
  text?: string;
  favorite_count?: number;
  likeCount?: number;
  reply_count?: number;
  replyCount?: number;
  retweet_count?: number;
  retweetCount?: number;
  views_count?: number;
  viewCount?: number;
  created_at?: string;
  createdAt?: string;
  id?: string;
  id_str?: string;
  author?: TwitterAuthor;
  user?: TwitterAuthor;
}

// ─── URL helpers ─────────────────────────────────────────────────────────────

export function isTwitterUrl(raw: string): boolean {
  const h = raw.trim().toLowerCase().replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  return h.startsWith('twitter.com/') || h.startsWith('x.com/');
}

export function normalizeTwitterHandle(raw: string): string {
  let h = raw.trim().replace(/^@/, '');
  h = h.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  if (h.startsWith('twitter.com/') || h.startsWith('x.com/')) {
    const parts = h.split('/').filter(Boolean);
    return parts[1] ?? h;
  }
  return h.toLowerCase();
}

function profileUrl(username: string): string {
  return `https://twitter.com/${username}`;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function scrapeTwitterCompetitorProfile(
  rawHandle: string,
  token: string,
  fromDate?: string,
  toDate?: string,
): Promise<CompetitorProfileData> {
  const username = normalizeTwitterHandle(rawHandle);
  const from = fromDate ?? new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10);
  const to   = toDate   ?? new Date().toISOString().slice(0, 10);

  const fromTs = new Date(from).getTime();
  const toTs   = new Date(to).getTime() + 86_400_000;

  const items = await runActorSyncItems<TwitterItem>(
    TWITTER_ACTOR,
    {
      startUrls:    [{ url: profileUrl(username) }],
      maxItems:     200,
      tweetLanguage: 'any',
    },
    token,
    512,
    300,
  );

  // Extract profile info from the first item's author/user field
  const firstItem = items[0];
  const author = firstItem?.author ?? firstItem?.user;
  const followers = author?.followers_count ?? author?.followersCount ?? null;
  const profilePicUrl =
    author?.profile_image_url_https?.replace('_normal', '') ??
    author?.profile_image_url ?? null;

  const profile: ScrapedProfile = {
    username,
    followers,
    following: null,
    profilePicUrl,
  };

  const posts: ScrapedPost[] = items
    .map(item => {
      const rawTs = item.created_at ? new Date(item.created_at).getTime()
        : item.createdAt ? new Date(item.createdAt).getTime() : null;

      const likes    = item.favorite_count ?? item.likeCount   ?? 0;
      const comments = item.reply_count    ?? item.replyCount  ?? 0;
      const views    = item.views_count    ?? item.viewCount   ?? null;

      return {
        postIdExternal: item.id_str ?? item.id ?? null,
        postUrl:        item.url ?? item.tweetUrl ?? item.tweet_url ?? null,
        postType:       'Tweet',
        publishedAt:    item.created_at ?? item.createdAt ?? null,
        caption:        item.full_text ?? item.text ?? null,
        likes,
        comments,
        views,
        engagement: likes + comments,
        _ts: rawTs,
      };
    })
    .filter(p => p._ts === null || (p._ts >= fromTs && p._ts <= toTs))
    .map(({ _ts, ...post }) => post);

  return { profile, posts };
}
