import type { NormalizedMetrics } from '../interface';

type RawItem = Record<string, unknown>;

function num(val: unknown): number | undefined {
  const n = Number(val);
  return isNaN(n) ? undefined : n;
}

function normalizeInstagram(item: RawItem): NormalizedMetrics {
  const url = (item['url'] ?? item['shortCode'] ?? '') as string;

  // Extract coauthor handles (collab posts)
  const coauthorRaw = item['coauthorProducers'] as RawItem[] | undefined;
  const coauthorHandles = Array.isArray(coauthorRaw)
    ? coauthorRaw.map(c => (c['username'] ?? c['Username'] ?? '') as string).filter(Boolean)
    : undefined;

  // Extract tagged user handles
  const taggedRaw = item['taggedUsers'] as RawItem[] | undefined;
  const usertagsRaw = item['usertags'] as RawItem[] | undefined;
  const taggedUserHandles = Array.isArray(taggedRaw)
    ? taggedRaw.map(u => (u['username'] ?? '') as string).filter(Boolean)
    : Array.isArray(usertagsRaw)
    ? usertagsRaw.map(u => ((u['user'] as RawItem | undefined)?.['username'] ?? '') as string).filter(Boolean)
    : undefined;

  return {
    url: (item['url'] as string) ?? url,
    likes: num(item['likesCount']),
    comments: num(item['commentsCount']),
    saves: num(item['savesCount']),
    views: num(item['videoPlayCount'] ?? item['videoViewCount']),
    publishedAt: item['timestamp'] as string | undefined,
    caption: (item['caption'] ?? item['text'] ?? item['description']) as string | undefined,
    ownerUsername: (item['ownerUsername'] ?? item['owner_username']) as string | undefined,
    coauthorHandles: coauthorHandles?.length ? coauthorHandles : undefined,
    taggedUserHandles: taggedUserHandles?.length ? taggedUserHandles : undefined,
  };
}

function normalizeFacebook(item: RawItem): NormalizedMetrics {
  const reactions = item['reactions'] as RawItem | undefined;
  const shares = item['shares'];
  const comments = item['comments'];

  // reactions is { like, love, haha, wow, sad, angry } — no .count field
  let likes: number | undefined;
  if (reactions && typeof reactions === 'object') {
    const total = Object.values(reactions).reduce((s: number, v) => s + (Number(v) || 0), 0);
    likes = total > 0 ? total : num(item['likesCount'] ?? item['likes']);
  } else {
    likes = num(item['likesCount'] ?? item['likes']);
  }

  return {
    url: (item['url'] ?? item['postUrl']) as string,
    likes,
    // comments/shares may be a direct number or an object with .count
    comments: num(typeof comments === 'number' ? comments : (comments as RawItem | undefined)?.['count'] ?? item['commentsCount']),
    shares: num(typeof shares === 'number' ? shares : (shares as RawItem | undefined)?.['count'] ?? item['sharesCount']),
    views: num(item['videoViewCount'] ?? item['viewsCount'] ?? item['videoViews']),
    publishedAt: (item['time'] ?? item['timestamp']) as string | undefined,
  };
}

function normalizeTwitter(item: RawItem): NormalizedMetrics {
  return {
    url: (item['url'] ?? item['tweetUrl']) as string,
    likes: num(item['favorite_count'] ?? item['likeCount']),
    comments: num(item['reply_count'] ?? item['replyCount']),
    shares: num(item['retweet_count'] ?? item['retweetCount']),
    views: num(item['views_count'] ?? item['viewCount']),
    publishedAt: (item['created_at'] ?? item['createdAt']) as string | undefined,
  };
}

function normalizeLinkedIn(item: RawItem): NormalizedMetrics {
  const engagement = item['engagement'] as RawItem | undefined;
  const postedAt = item['postedAt'] as RawItem | undefined;
  return {
    url: (item['linkedinUrl'] ?? item['url'] ?? item['postUrl']) as string,
    likes: num(engagement?.['likes'] ?? item['numLikes'] ?? item['likesCount']),
    comments: num(engagement?.['comments'] ?? item['numComments'] ?? item['commentsCount']),
    shares: num(engagement?.['shares'] ?? item['numShares'] ?? item['sharesCount']),
    views: num(item['viewCount'] ?? item['impressionCount']),
    publishedAt: (postedAt?.['date'] ?? item['postedDate']) as string | undefined,
    caption: (item['text'] ?? item['caption'] ?? item['description'] ?? item['content']) as string | undefined,
  };
}

function normalizeYouTube(item: RawItem): NormalizedMetrics {
  const stats = item['statistics'] as RawItem | undefined;
  return {
    url: (item['url'] ?? `https://www.youtube.com/watch?v=${item['id']}`) as string,
    likes: num(item['likes'] ?? stats?.['likeCount'] ?? item['likeCount']),
    comments: num(item['comment_count'] ?? stats?.['commentCount'] ?? item['commentCount']),
    views: num(item['views'] ?? stats?.['viewCount'] ?? item['viewCount']),
    publishedAt: (item['upload_date'] ?? item['publishedAt'] ?? item['uploadDate']) as string | undefined,
  };
}

const NORMALIZERS: Record<string, (item: RawItem) => NormalizedMetrics> = {
  Instagram: normalizeInstagram,
  Facebook:  normalizeFacebook,
  Twitter:   normalizeTwitter,
  LinkedIn:  normalizeLinkedIn,
  YouTube:   normalizeYouTube,
};

export function normalizeItems(platform: string, items: RawItem[]): NormalizedMetrics[] {
  const normalizer = NORMALIZERS[platform];
  if (!normalizer) return [];
  return items.map(normalizer);
}
