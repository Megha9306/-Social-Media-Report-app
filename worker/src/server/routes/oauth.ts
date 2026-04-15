import type { Env } from '../../types/env';
import { generateId } from '../../utils/id';
import { getOAuthProvider, isValidOAuthPlatform } from '../../services/oauth/index';
import { upsertConnectedAccount } from '../../db/queries';
import type { OAuthCreds } from '../routers/settings';

const STATE_TTL_SECONDS = 600; // 10 minutes

// ─── Credential resolution ────────────────────────────────────────────────────
// Priority: KV (entered via Settings UI) → wrangler.toml env vars

async function getKVCreds(platform: string, env: Env): Promise<OAuthCreds | null> {
  try {
    const raw = await env.REPORT_CACHE.get(`settings:oauth_creds:${platform}`);
    if (!raw) return null;
    const data = JSON.parse(raw) as OAuthCreds;
    return data.clientId && data.clientSecret ? data : null;
  } catch {
    return null;
  }
}

/**
 * Patch the env object with credentials from KV (if available) so that the
 * OAuth provider functions receive the correct values regardless of whether
 * credentials came from wrangler.toml or the Settings UI.
 */
async function resolveEnv(platform: string, env: Env): Promise<Env | null> {
  const kv = await getKVCreds(platform, env);

  // Derive redirect URI from WORKER_URL so users never have to configure it
  const redirectBase = env.WORKER_URL.replace(/\/$/, '');
  const redirectUri  = `${redirectBase}/api/auth/${platform}/callback`;

  if (kv) {
    // Credentials from KV — patch env
    switch (platform) {
      case 'meta':
        return { ...env, META_APP_ID: kv.clientId, META_APP_SECRET: kv.clientSecret, META_REDIRECT_URI: redirectUri };
      case 'linkedin':
        return { ...env, LINKEDIN_CLIENT_ID: kv.clientId, LINKEDIN_CLIENT_SECRET: kv.clientSecret, LINKEDIN_REDIRECT_URI: redirectUri };
      case 'twitter':
        return { ...env, TWITTER_CLIENT_ID: kv.clientId, TWITTER_CLIENT_SECRET: kv.clientSecret, TWITTER_REDIRECT_URI: redirectUri };
      case 'youtube':
        return { ...env, GOOGLE_CLIENT_ID: kv.clientId, GOOGLE_CLIENT_SECRET: kv.clientSecret, GOOGLE_REDIRECT_URI: redirectUri };
    }
  }

  // Fall back to env vars — check if they're configured (not placeholder values)
  const envConfigured: Record<string, string | undefined> = {
    meta:     env.META_APP_ID,
    linkedin: env.LINKEDIN_CLIENT_ID,
    twitter:  env.TWITTER_CLIENT_ID,
    youtube:  env.GOOGLE_CLIENT_ID,
  };
  const val = envConfigured[platform];
  if (val && !val.startsWith('your_') && val !== 'placeholder') {
    return env;
  }

  return null; // not configured
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export async function handleOAuthInit(
  platform: string,
  _request: Request,
  env: Env,
): Promise<Response> {
  if (!isValidOAuthPlatform(platform)) {
    return new Response(`Unknown platform: ${platform}`, { status: 400 });
  }

  const resolvedEnv = await resolveEnv(platform, env);
  if (!resolvedEnv) {
    const msg = `API credentials for ${platform} have not been configured yet. Go to Settings → API Credentials to add them.`;
    return Response.redirect(`${env.APP_URL}/settings?error=${encodeURIComponent(msg)}`, 302);
  }

  const provider = getOAuthProvider(platform);
  const state    = generateId();

  const { url, codeVerifier } = await provider.buildAuthUrl(resolvedEnv, state);

  const kvValue = codeVerifier ? JSON.stringify({ codeVerifier }) : '{}';
  await env.REPORT_CACHE.put(`oauth:state:${state}`, kvValue, { expirationTtl: STATE_TTL_SECONDS });

  return Response.redirect(url, 302);
}

// ─── Callback ─────────────────────────────────────────────────────────────────

export async function handleOAuthCallback(
  platform: string,
  request: Request,
  env: Env,
): Promise<Response> {
  if (!isValidOAuthPlatform(platform)) {
    return new Response(`Unknown platform: ${platform}`, { status: 400 });
  }

  const searchParams = new URL(request.url).searchParams;
  const code  = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    return Response.redirect(`${env.APP_URL}/settings?error=${encodeURIComponent(error)}`, 302);
  }
  if (!code || !state) {
    return new Response('Missing code or state', { status: 400 });
  }

  // Validate state and retrieve any stored PKCE verifier
  const kvValue = await env.REPORT_CACHE.get(`oauth:state:${state}`);
  if (!kvValue) {
    return new Response('Invalid or expired state', { status: 400 });
  }
  await env.REPORT_CACHE.delete(`oauth:state:${state}`);

  let extra: Record<string, string> = {};
  try { extra = JSON.parse(kvValue); } catch { /* ignore */ }

  // Resolve env with KV credentials (same as init, so callback uses the same creds)
  const resolvedEnv = await resolveEnv(platform, env) ?? env;
  const provider    = getOAuthProvider(platform);

  // Exchange code for tokens
  let tokens: { accessToken: string; refreshToken: string | null; expiresAt: string };
  try {
    tokens = await provider.exchangeCode(code, resolvedEnv, extra);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.redirect(`${env.APP_URL}/settings?error=${encodeURIComponent(msg)}`, 302);
  }

  // Fetch account info (may return multiple accounts, e.g. Meta FB + IG)
  let accounts: Array<{ id: string; username: string; platform: string; extra: Record<string, string> }>;
  try {
    accounts = await provider.getAccounts(tokens.accessToken, resolvedEnv);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.redirect(`${env.APP_URL}/settings?error=${encodeURIComponent(msg)}`, 302);
  }

  // Upsert each account into the DB
  for (const acct of accounts) {
    await upsertConnectedAccount(env.DB, {
      id:            generateId(),
      platform:      acct.platform,
      account_id:    acct.id,
      username:      acct.username,
      access_token:  tokens.accessToken,
      refresh_token: tokens.refreshToken,
      token_expiry:  tokens.expiresAt,
      extra:         Object.keys(acct.extra).length ? JSON.stringify(acct.extra) : null,
    });
  }

  return Response.redirect(`${env.APP_URL}/settings?connected=${platform}`, 302);
}
