import type { Env } from '../../types/env';

const AUTH_URL  = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const API_BASE  = 'https://api.linkedin.com/v2';

// ─── Auth URL ─────────────────────────────────────────────────────────────────

export function buildLinkedInAuthUrl(env: Env, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     env.LINKEDIN_CLIENT_ID,
    redirect_uri:  env.LINKEDIN_REDIRECT_URI,
    state,
    scope:         'r_organization_social rw_organization_admin profile email',
  });
  return `${AUTH_URL}?${params}`;
}

// ─── Token exchange ───────────────────────────────────────────────────────────

export async function exchangeLinkedInCode(
  code: string,
  env: Env,
): Promise<{ accessToken: string; expiresAt: string }> {
  const body = new URLSearchParams({
    grant_type:    'authorization_code',
    code,
    redirect_uri:  env.LINKEDIN_REDIRECT_URI,
    client_id:     env.LINKEDIN_CLIENT_ID,
    client_secret: env.LINKEDIN_CLIENT_SECRET,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`LinkedIn token exchange failed: ${await res.text()}`);

  const data = await res.json<{ access_token: string; expires_in?: number }>();
  const expiresIn = data.expires_in ?? 5_184_000; // 60 days default
  return {
    accessToken: data.access_token,
    expiresAt:   new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

// ─── Account discovery ────────────────────────────────────────────────────────

export interface LinkedInAccount {
  id: string;
  username: string;
  extra: Record<string, string>;
}

export async function getLinkedInAccounts(token: string): Promise<LinkedInAccount[]> {
  // Get the user's own profile
  const meRes = await fetch(`${API_BASE}/me?projection=(id,localizedFirstName,localizedLastName)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!meRes.ok) throw new Error(`LinkedIn /me failed: ${await meRes.text()}`);
  const me = await meRes.json<{ id?: string; localizedFirstName?: string; localizedLastName?: string }>();

  const accounts: LinkedInAccount[] = [];

  if (me.id) {
    const name = [me.localizedFirstName, me.localizedLastName].filter(Boolean).join(' ') || me.id;
    accounts.push({ id: me.id, username: name, extra: { urn: `urn:li:person:${me.id}` } });
  }

  // Get managed organization pages
  try {
    const orgsRes = await fetch(
      `${API_BASE}/organizationalEntityAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organizationalTarget~(id,localizedName)))`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (orgsRes.ok) {
      const orgs = await orgsRes.json<{
        elements?: Array<{ 'organizationalTarget~'?: { id?: string; localizedName?: string } }>;
      }>();
      for (const el of orgs.elements ?? []) {
        const org = el['organizationalTarget~'];
        if (org?.id) {
          accounts.push({
            id:       `org_${org.id}`,
            username: org.localizedName ?? org.id,
            extra:    { org_id: org.id, org_urn: `urn:li:organization:${org.id}` },
          });
        }
      }
    }
  } catch {
    // Org lookup is optional — personal profile already added
  }

  return accounts;
}
