import type { Env } from '../../types/env';

const GRAPH = 'https://graph.facebook.com/v19.0';

// ─── Auth URL ─────────────────────────────────────────────────────────────────

export function buildMetaAuthUrl(env: Env, state: string): string {
  const params = new URLSearchParams({
    client_id:     env.META_APP_ID,
    redirect_uri:  env.META_REDIRECT_URI,
    scope:         'instagram_basic,instagram_manage_insights,pages_show_list,pages_read_engagement',
    state,
    response_type: 'code',
  });
  return `https://www.facebook.com/dialog/oauth?${params}`;
}

// ─── Token exchange ───────────────────────────────────────────────────────────

async function graphGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Meta API ${path} failed (${res.status}): ${await res.text()}`);
  return res.json<T>();
}

export async function exchangeMetaCode(
  code: string,
  env: Env,
): Promise<{ accessToken: string; expiresAt: string }> {
  // Step 1: exchange code for short-lived user token
  const p1 = new URLSearchParams({
    client_id:     env.META_APP_ID,
    client_secret: env.META_APP_SECRET,
    redirect_uri:  env.META_REDIRECT_URI,
    code,
  });
  const r1 = await fetch(`${GRAPH}/oauth/access_token?${p1}`);
  if (!r1.ok) throw new Error(`Meta token exchange failed: ${await r1.text()}`);
  const d1 = await r1.json<{ access_token: string }>();

  // Step 2: exchange for long-lived user token (60 days)
  const p2 = new URLSearchParams({
    grant_type:        'fb_exchange_token',
    client_id:         env.META_APP_ID,
    client_secret:     env.META_APP_SECRET,
    fb_exchange_token: d1.access_token,
  });
  const r2 = await fetch(`${GRAPH}/oauth/access_token?${p2}`);
  if (!r2.ok) throw new Error(`Meta long-lived token exchange failed: ${await r2.text()}`);
  const d2 = await r2.json<{ access_token: string; expires_in?: number }>();

  const expiresIn = d2.expires_in ?? 5_184_000; // 60 days default
  return {
    accessToken: d2.access_token,
    expiresAt:   new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

// ─── Account discovery ────────────────────────────────────────────────────────

export interface MetaAccount {
  id: string;
  username: string;
  platform: 'Instagram' | 'Facebook';
  extra: Record<string, string>;  // stored as JSON in DB
}

export async function getMetaAccounts(userToken: string): Promise<MetaAccount[]> {
  const pagesData = await graphGet<{
    data: Array<{ id: string; name: string; access_token: string }>;
  }>('/me/accounts?fields=id,name,access_token', userToken);

  const accounts: MetaAccount[] = [];

  for (const page of pagesData.data ?? []) {
    // Facebook page account
    accounts.push({
      id:       page.id,
      username: page.name,
      platform: 'Facebook',
      extra:    { page_id: page.id, page_token: page.access_token },
    });

    // Check for linked Instagram Business account
    try {
      const igData = await graphGet<{ instagram_business_account?: { id: string } }>(
        `/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`,
        page.access_token,
      );
      const igId = igData.instagram_business_account?.id;
      if (igId) {
        const igProfile = await graphGet<{ username?: string }>(
          `/${igId}?fields=username&access_token=${page.access_token}`,
          page.access_token,
        );
        accounts.push({
          id:       igId,
          username: igProfile.username ?? igId,
          platform: 'Instagram',
          extra:    { ig_user_id: igId, page_id: page.id, page_token: page.access_token },
        });
      }
    } catch {
      // No linked IG account on this page — skip
    }
  }

  return accounts;
}
