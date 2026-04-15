export type Platform = 'Instagram' | 'Facebook' | 'Twitter' | 'LinkedIn' | 'YouTube';
export type Format = 'Static' | 'Carousel' | 'Gif' | 'Reel' | 'Video Post' | 'Story' | 'Article';

const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'igshid', 'fbclid', 'si', 'feature', 'ref', 'hl', 'pp', 'ab_channel',
  'rcm',
];

export function detectPlatform(url: string): Platform | null {
  try {
    const { hostname } = new URL(url);
    const host = hostname.replace(/^www\./, '');
    if (host === 'instagram.com') return 'Instagram';
    if (host === 'facebook.com' || host === 'fb.com') return 'Facebook';
    if (host === 'twitter.com' || host === 'x.com') return 'Twitter';
    if (host === 'linkedin.com') return 'LinkedIn';
    if (host === 'youtube.com' || host === 'youtu.be') return 'YouTube';
    return null;
  } catch {
    return null;
  }
}

export function detectFormat(url: string, platform: Platform): Format | null {
  try {
    const { pathname } = new URL(url);
    switch (platform) {
      case 'Instagram':
        if (pathname.includes('/reel/')) return 'Reel';
        if (pathname.includes('/stories/')) return 'Story';
        if (pathname.includes('/p/')) return 'Static'; // user can upgrade to Carousel
        return null;
      case 'YouTube':
        if (pathname.includes('/shorts/')) return 'Reel';
        if (pathname.startsWith('/watch') || pathname.includes('/embed/')) return 'Video Post';
        return null;
      case 'LinkedIn':
        if (pathname.includes('/posts/') || pathname.includes('/pulse/')) return 'Article';
        return 'Static';
      case 'Facebook':
        if (pathname.includes('/videos/') || pathname.includes('/video/')) return 'Video Post';
        if (pathname.includes('/reels/')) return 'Reel';
        return 'Static';
      case 'Twitter':
        return 'Static';
    }
  } catch {
    return null;
  }
}

export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove tracking params
    for (const param of TRACKING_PARAMS) {
      parsed.searchParams.delete(param);
    }
    // Remove trailing slash from pathname
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    // Normalise protocol
    parsed.protocol = 'https:';
    // Canonicalise Twitter hostname: twitter.com → x.com (x.com is official)
    const rawHost = parsed.hostname.replace(/^www\./, '');
    if (rawHost === 'twitter.com') {
      parsed.hostname = 'x.com';
    }
    // Strip www. for consistency
    parsed.hostname = parsed.hostname.replace(/^www\./, '');
    // Drop fragment
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url;
  }
}

export function extractExternalId(url: string, platform: Platform): string | null {
  try {
    const { pathname, searchParams, hostname } = new URL(url);
    switch (platform) {
      case 'Instagram': {
        const match = pathname.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
        return match ? (match[2] ?? null) : null;
      }
      case 'YouTube': {
        if (hostname === 'youtu.be') return pathname.slice(1);
        const shorts = pathname.match(/\/shorts\/([A-Za-z0-9_-]+)/);
        if (shorts) return shorts[1] ?? null;
        return searchParams.get('v');
      }
      case 'Twitter': {
        const match = pathname.match(/\/status\/(\d+)/);
        return match ? (match[1] ?? null) : null;
      }
      case 'LinkedIn': {
        const match = pathname.match(/activity[:-](\d+)/);
        return match ? (match[1] ?? null) : null;
      }
      case 'Facebook': {
        const match = pathname.match(/\/(?:posts|videos|reels)\/([^/?]+)/);
        return match ? (match[1] ?? null) : null;
      }
    }
  } catch {
    return null;
  }
}

export function extractUploaderHandle(url: string, platform: Platform): string | null {
  try {
    const { pathname } = new URL(url);
    switch (platform) {
      case 'Instagram': {
        // /stories/{username}/{id}
        const story = pathname.match(/^\/stories\/([A-Za-z0-9._]+)\//);
        if (story) return story[1]?.toLowerCase() ?? null;
        // /{username}/p/{code} or /{username}/reel/{code}
        const post = pathname.match(/^\/([A-Za-z0-9._]+)\/(p|reel|tv)\//);
        if (post) return post[1]?.toLowerCase() ?? null;
        return null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export async function validateUrl(url: string): Promise<boolean> {
  try {
    new URL(url); // must be parseable
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return res.ok;
  } catch {
    return false;
  }
}
