import type { Env } from '../../types/env';

const AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

// ─── Auth URL ─────────────────────────────────────────────────────────────────

export function buildYouTubeAuthUrl(env: Env, state: string): string {
  const params = new URLSearchParams({
    client_id:     env.GOOGLE_CLIENT_ID,
    redirect_uri:  env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope:         'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly',
    access_type:   'offline',
    prompt:        'consent',  // force refresh_token on every auth
    state,
  });
  return `${AUTH_URL}?${params}`;
}

// ─── Token exchange ───────────────────────────────────────────────────────────

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

async function postGoogleToken(body: URLSearchParams): Promise<GoogleTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Google token request failed: ${await res.text()}`);
  return res.json<GoogleTokenResponse>();
}

export async function exchangeYouTubeCode(
  code: string,
  env: Env,
): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: string }> {
  const body = new URLSearchParams({
    code,
    client_id:     env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri:  env.GOOGLE_REDIRECT_URI,
    grant_type:    'authorization_code',
  });
  const data = await postGoogleToken(body);
  return {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt:    new Date(Date.now() + (data.expires_in ?? 3_600) * 1000).toISOString(),
  };
}

export async function refreshYouTubeToken(
  refreshToken: string,
  env: Env,
): Promise<{ accessToken: string; expiresAt: string }> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id:     env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    grant_type:    'refresh_token',
  });
  const data = await postGoogleToken(body);
  return {
    accessToken: data.access_token,
    expiresAt:   new Date(Date.now() + (data.expires_in ?? 3_600) * 1000).toISOString(),
  };
}

// ─── Account info ─────────────────────────────────────────────────────────────

export async function getYouTubeAccountInfo(
  token: string,
): Promise<{ id: string; username: string; extra: Record<string, string> }> {
  const res = await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`YouTube channels API failed: ${await res.text()}`);
  const data = await res.json<{
    items?: Array<{ id?: string; snippet?: { title?: string; customUrl?: string } }>;
  }>();
  const channel = data.items?.[0];
  if (!channel?.id) throw new Error('No YouTube channel found for this account');
  return {
    id:       channel.id,
    username: channel.snippet?.title ?? channel.id,
    extra:    { channel_id: channel.id, custom_url: channel.snippet?.customUrl ?? '' },
  };
}
