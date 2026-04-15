import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { safeJsonParse } from '../../utils/json';

const IG_KV_KEY = 'settings:ig_connection';

interface IgConnectionData {
  authType: 'usernamePassword';
  handle: string;
  password: string;
}

// ─── OAuth platform credential keys ──────────────────────────────────────────

const OAUTH_PLATFORMS = ['meta', 'linkedin', 'twitter', 'youtube'] as const;
type OAuthPlatformKey = typeof OAUTH_PLATFORMS[number];

function oauthKvKey(platform: OAuthPlatformKey): string {
  return `settings:oauth_creds:${platform}`;
}

export interface OAuthCreds {
  clientId: string;
  clientSecret: string;
}

export const settingsRouter = router({
  getIgConnection: protectedProcedure
    .query(async ({ ctx }) => {
      const raw = await ctx.env.REPORT_CACHE.get(IG_KV_KEY);
      if (!raw) return { connected: false, handle: null };
      const data = safeJsonParse<IgConnectionData | null>(raw, null);
      if (!data) return { connected: false, handle: null };
      return { connected: true, handle: data.handle };
    }),

  saveIgConnection: protectedProcedure
    .input(z.object({
      handle: z.string().min(1).max(60),
      password: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const data: IgConnectionData = {
        authType: 'usernamePassword',
        handle: input.handle.replace(/^@/, ''),
        password: input.password,
      };
      await ctx.env.REPORT_CACHE.put(IG_KV_KEY, JSON.stringify(data));
      return { ok: true };
    }),

  removeIgConnection: protectedProcedure
    .mutation(async ({ ctx }) => {
      await ctx.env.REPORT_CACHE.delete(IG_KV_KEY);
      return { ok: true };
    }),

  // ── OAuth app credentials (stored in KV, entered via Settings UI) ───────────

  getOAuthCreds: protectedProcedure
    .input(z.object({ platform: z.enum(OAUTH_PLATFORMS) }))
    .query(async ({ input, ctx }) => {
      const raw = await ctx.env.REPORT_CACHE.get(oauthKvKey(input.platform));
      if (!raw) return { configured: false, clientId: null };
      const data = safeJsonParse<OAuthCreds | null>(raw, null);
      if (!data?.clientId) return { configured: false, clientId: null };
      // Never return the secret to the frontend
      return { configured: true, clientId: data.clientId };
    }),

  saveOAuthCreds: protectedProcedure
    .input(z.object({
      platform:     z.enum(OAUTH_PLATFORMS),
      clientId:     z.string().min(1),
      clientSecret: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const data: OAuthCreds = { clientId: input.clientId, clientSecret: input.clientSecret };
      await ctx.env.REPORT_CACHE.put(oauthKvKey(input.platform), JSON.stringify(data));
      return { ok: true };
    }),

  removeOAuthCreds: protectedProcedure
    .input(z.object({ platform: z.enum(OAUTH_PLATFORMS) }))
    .mutation(async ({ input, ctx }) => {
      await ctx.env.REPORT_CACHE.delete(oauthKvKey(input.platform));
      return { ok: true };
    }),

  getWorkerUrl: protectedProcedure
    .query(({ ctx }) => ({ url: ctx.env.WORKER_URL })),
});

export type SettingsRouter = typeof settingsRouter;
