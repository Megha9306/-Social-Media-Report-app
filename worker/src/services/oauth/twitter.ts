import type { Env } from '../../types/env';

const AUTH_URL  = 'https://twitter.com/i/oauth2/authorize';
const TOKEN_URL = 'https://api.twitter.com/2/oauth2/token';

// ─── PKCE helpers ─────────────────────────────────────────────────────────────

export async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const verifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const challenge = btoa(String.fromCharCode(...hashArray))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  return { verifier, challenge };
}

// ─── Auth URL ─────────────────────────────────────────────────────────────────

export function buildTwitterAuthUrl(env: Env, state: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    response_type:         'code',
    client_id:             env.TWITTER_CLIENT_ID,
    redirect_uri:          env.TWITTER_REDIRECT_URI,
    scope:                 'tweet.read users.read offline.access',
    state,
    code_challenge:        codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${AUTH_URL}?${params}`;
}

// ─── Token exchange ───────────────────────────────────────────────────────────

interface TwitterTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

async function postToken(body: URLSearchParams, env: Env): Promise<TwitterTokenResponse> {
  const credentials = btoa(`${env.TWITTER_CLIENT_ID}:${env.TWITTER_CLIENT_SECRET}`);
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      Authorization:   `Basic ${credentials}`,
    },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Twitter token request failed: ${await res.text()}`);
  return res.json<TwitterTokenResponse>();
}

export async function exchangeTwitterCode(
  code: string,
  codeVerifier: string,
  env: Env,
): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: string }> {
  const body = new URLSearchParams({
    grant_type:    'authorization_code',
    code,
    redirect_uri:  env.TWITTER_REDIRECT_URI,
    code_verifier: codeVerifier,
  });
  const data = await postToken(body, env);
  return {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt:    new Date(Date.now() + (data.expires_in ?? 7_200) * 1000).toISOString(),
  };
}

export async function refreshTwitterToken(
  refreshToken: string,
  env: Env,
): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: string }> {
  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
  });
  const data = await postToken(body, env);
  return {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt:    new Date(Date.now() + (data.expires_in ?? 7_200) * 1000).toISOString(),
  };
}

// ─── Account info ─────────────────────────────────────────────────────────────

export async function getTwitterAccountInfo(
  token: string,
): Promise<{ id: string; username: string }> {
  const res = await fetch('https://api.twitter.com/2/users/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Twitter /users/me failed: ${await res.text()}`);
  const data = await res.json<{ data?: { id?: string; username?: string } }>();
  const user = data.data;
  if (!user?.id) throw new Error('Twitter /users/me returned no user');
  return { id: user.id, username: user.username ?? user.id };
}
