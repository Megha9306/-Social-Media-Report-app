import type { Env } from '../../types/env';
import {
  buildMetaAuthUrl,
  exchangeMetaCode,
  getMetaAccounts,
} from './meta';
import {
  buildLinkedInAuthUrl,
  exchangeLinkedInCode,
  getLinkedInAccounts,
} from './linkedin';
import {
  generatePKCE,
  buildTwitterAuthUrl,
  exchangeTwitterCode,
  refreshTwitterToken,
  getTwitterAccountInfo,
} from './twitter';
import {
  buildYouTubeAuthUrl,
  exchangeYouTubeCode,
  refreshYouTubeToken,
  getYouTubeAccountInfo,
} from './youtube';

export type OAuthPlatform = 'meta' | 'linkedin' | 'twitter' | 'youtube';

export interface OAuthProvider {
  /**
   * Build the redirect URL to send the user to the provider's consent page.
   * For Twitter, also returns the generated codeVerifier to be stored in KV.
   */
  buildAuthUrl(env: Env, state: string, extra?: Record<string, string>): Promise<{ url: string; codeVerifier?: string }>;

  /**
   * Exchange an authorization code (+ optional PKCE verifier) for tokens.
   * Returns accessToken, optional refreshToken, and expiresAt (ISO string).
   */
  exchangeCode(
    code: string,
    env: Env,
    extra?: Record<string, string>,
  ): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: string }>;

  /**
   * Refresh an access token using the stored refresh token.
   * Returns null if the platform does not support refresh (Meta, LinkedIn).
   */
  refreshToken?(
    refreshToken: string,
    env: Env,
  ): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: string } | null>;

  /**
   * Fetch basic account information after the token exchange.
   * May return multiple accounts (Meta returns FB pages + IG accounts; LinkedIn
   * returns the personal profile + any managed company pages).
   */
  getAccounts(
    accessToken: string,
    env: Env,
  ): Promise<Array<{ id: string; username: string; platform: string; extra: Record<string, string> }>>;
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const metaProvider: OAuthProvider = {
  async buildAuthUrl(env, state) {
    return { url: buildMetaAuthUrl(env, state) };
  },

  async exchangeCode(code, env) {
    const result = await exchangeMetaCode(code, env);
    return { ...result, refreshToken: null };
  },

  async getAccounts(accessToken) {
    const accounts = await getMetaAccounts(accessToken);
    return accounts.map(a => ({
      id:       a.id,
      username: a.username,
      platform: a.platform,  // 'Instagram' | 'Facebook'
      extra:    a.extra,
    }));
  },
};

// ─── LinkedIn ─────────────────────────────────────────────────────────────────

const linkedInProvider: OAuthProvider = {
  async buildAuthUrl(env, state) {
    return { url: buildLinkedInAuthUrl(env, state) };
  },

  async exchangeCode(code, env) {
    const result = await exchangeLinkedInCode(code, env);
    return { ...result, refreshToken: null };
  },

  async getAccounts(accessToken) {
    const accounts = await getLinkedInAccounts(accessToken);
    return accounts.map(a => ({
      id:       a.id,
      username: a.username,
      platform: 'LinkedIn',
      extra:    a.extra,
    }));
  },
};

// ─── Twitter ──────────────────────────────────────────────────────────────────

const twitterProvider: OAuthProvider = {
  async buildAuthUrl(env, state) {
    const { verifier, challenge } = await generatePKCE();
    const url = buildTwitterAuthUrl(env, state, challenge);
    return { url, codeVerifier: verifier };
  },

  async exchangeCode(code, env, extra) {
    const codeVerifier = extra?.codeVerifier ?? '';
    return exchangeTwitterCode(code, codeVerifier, env);
  },

  async refreshToken(refreshToken, env) {
    return refreshTwitterToken(refreshToken, env);
  },

  async getAccounts(accessToken) {
    const info = await getTwitterAccountInfo(accessToken);
    return [{
      id:       info.id,
      username: info.username,
      platform: 'Twitter',
      extra:    {},
    }];
  },
};

// ─── YouTube ──────────────────────────────────────────────────────────────────

const youTubeProvider: OAuthProvider = {
  async buildAuthUrl(env, state) {
    return { url: buildYouTubeAuthUrl(env, state) };
  },

  async exchangeCode(code, env) {
    return exchangeYouTubeCode(code, env);
  },

  async refreshToken(refreshToken, env) {
    const result = await refreshYouTubeToken(refreshToken, env);
    return { ...result, refreshToken: null };
  },

  async getAccounts(accessToken) {
    const info = await getYouTubeAccountInfo(accessToken);
    return [{
      id:       info.id,
      username: info.username,
      platform: 'YouTube',
      extra:    info.extra,
    }];
  },
};

// ─── Factory ──────────────────────────────────────────────────────────────────

const providers: Record<OAuthPlatform, OAuthProvider> = {
  meta:     metaProvider,
  linkedin: linkedInProvider,
  twitter:  twitterProvider,
  youtube:  youTubeProvider,
};

export function getOAuthProvider(platform: string): OAuthProvider {
  const p = providers[platform as OAuthPlatform];
  if (!p) throw new Error(`Unknown OAuth platform: ${platform}`);
  return p;
}

export function isValidOAuthPlatform(platform: string): platform is OAuthPlatform {
  return platform in providers;
}
