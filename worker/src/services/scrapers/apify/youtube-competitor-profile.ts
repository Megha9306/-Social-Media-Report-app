import { runActorSyncItems } from './client';
import type { CompetitorProfileData, ScrapedPost, ScrapedProfile } from './competitor-profile';

const YOUTUBE_ACTOR = 'beyondops/youtube-metadata-scraper-pro-v2';

// ─── Types ────────────────────────────────────────────────────────────────────

interface YouTubeItem {
  id?: string;
  videoId?: string;
  url?: string;
  title?: string;
  description?: string;
  views?: number;
  likes?: number;
  comment_count?: number;
  commentCount?: number;
  upload_date?: string;
  publishedAt?: string;
  uploadDate?: string;
  statistics?: {
    viewCount?: number;
    likeCount?: number;
    commentCount?: number;
    subscriberCount?: number;
  };
  channelName?: string;
  channelId?: string;
  channelUrl?: string;
  subscribers?: number;
  subscriberCount?: number;
  thumbnailUrl?: string;
  channelThumbnail?: string;
}

// ─── URL helpers ─────────────────────────────────────────────────────────────

export function isYouTubeUrl(raw: string): boolean {
  const h = raw.trim().toLowerCase().replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  return h.startsWith('youtube.com/') || h.startsWith('youtu.be/');
}

export function normalizeYouTubeHandle(raw: string): string {
  let h = raw.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  if (h.startsWith('youtube.com/') || h.startsWith('youtu.be/')) {
    return h; // keep the full path — actor handles all channel URL formats
  }
  // Treat as a @handle
  return `youtube.com/@${h.replace(/^@/, '')}`;
}

function channelUrl(handle: string): string {
  return `https://www.${handle}`;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function scrapeYouTubeCompetitorProfile(
  rawHandle: string,
  token: string,
  fromDate?: string,
  toDate?: string,
): Promise<CompetitorProfileData> {
  const handle = normalizeYouTubeHandle(rawHandle);
  const from = fromDate ?? new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10);
  const to   = toDate   ?? new Date().toISOString().slice(0, 10);

  const fromTs = new Date(from).getTime();
  const toTs   = new Date(to).getTime() + 86_400_000;

  const items = await runActorSyncItems<YouTubeItem>(
    YOUTUBE_ACTOR,
    {
      channelUrls: [channelUrl(handle)],
      maxResults:  200,
    },
    token,
    512,
    300,
  );

  // Extract channel-level metadata from the first item
  const firstItem = items[0];
  const stats = firstItem?.statistics;
  const subscribers =
    firstItem?.subscribers ??
    firstItem?.subscriberCount ??
    stats?.subscriberCount ??
    null;
  const profilePicUrl = firstItem?.channelThumbnail ?? firstItem?.thumbnailUrl ?? null;
  const channelName = firstItem?.channelName ?? handle;

  const profile: ScrapedProfile = {
    username:      channelName,
    followers:     subscribers,
    following:     null,
    profilePicUrl,
  };

  const posts: ScrapedPost[] = items
    .map(item => {
      const itemStats = item.statistics;
      const ts = item.upload_date ? new Date(item.upload_date).getTime()
        : item.publishedAt ? new Date(item.publishedAt).getTime()
        : item.uploadDate  ? new Date(item.uploadDate).getTime() : null;

      const videoId = item.videoId ?? item.id ?? null;
      const videoUrl =
        item.url ?? (videoId ? `https://www.youtube.com/watch?v=${videoId}` : null);

      const views    = item.views    ?? itemStats?.viewCount    ?? null;
      const likes    = item.likes    ?? itemStats?.likeCount    ?? 0;
      const comments = item.comment_count ?? item.commentCount ?? itemStats?.commentCount ?? 0;

      return {
        postIdExternal: videoId,
        postUrl:        videoUrl,
        postType:       'Video',
        publishedAt:    item.upload_date ?? item.publishedAt ?? item.uploadDate ?? null,
        caption:        item.title ?? null,
        likes,
        comments,
        views,
        engagement: likes + comments,
        _ts: ts,
      };
    })
    .filter(p => p._ts === null || (p._ts >= fromTs && p._ts <= toTs))
    .map(({ _ts, ...post }) => post);

  return { profile, posts };
}
