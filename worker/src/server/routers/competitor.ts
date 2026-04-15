import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { generateId } from '../../utils/id';
import { isLinkedInUrl } from '../../services/scrapers/apify/linkedin-competitor-profile';
import { isTwitterUrl } from '../../services/scrapers/apify/twitter-competitor-profile';
import { isFacebookUrl } from '../../services/scrapers/apify/facebook-competitor-profile';
import { isYouTubeUrl } from '../../services/scrapers/apify/youtube-competitor-profile';
import {
  insertCompetitorSet, listCompetitorSets, getCompetitorSet, deleteCompetitorSet, touchCompetitorSet,
  insertCompetitorAccount, listCompetitorAccounts, updateCompetitorAccountMeta,
  insertCompetitorRun, listCompetitorRuns, getCompetitorRun, updateCompetitorRunStatus, deleteCompetitorRun,
  insertCompetitorAccountRun, listCompetitorAccountRuns, getFullRunResults,
  updateCompetitorPost,
} from '../../db/competitor-queries';
import type { CompetitorJob } from '../../types/env';
import { buildCompetitorFallbackInsights } from '../../services/insights';

function detectCompetitorPlatform(handle: string): 'instagram' | 'linkedin' | 'twitter' | 'facebook' | 'youtube' {
  if (isLinkedInUrl(handle))  return 'linkedin';
  if (isTwitterUrl(handle))   return 'twitter';
  if (isFacebookUrl(handle))  return 'facebook';
  if (isYouTubeUrl(handle))   return 'youtube';
  return 'instagram';
}

const accountInputSchema = z.object({
  label:    z.string().min(1),
  handle:   z.string().min(1),
  is_self:  z.boolean().default(false),
  platform: z.enum(['instagram', 'linkedin', 'twitter', 'facebook', 'youtube']).default('instagram'),
});

export const competitorRouter = router({

  // ── List all saved sets ─────────────────────────────────────────────────
  listSets: protectedProcedure.query(async ({ ctx }) => {
    return listCompetitorSets(ctx.env.DB);
  }),

  // ── Get a single set with its accounts ─────────────────────────────────
  getSet: protectedProcedure
    .input(z.object({ setId: z.string() }))
    .query(async ({ input, ctx }) => {
      const set = await getCompetitorSet(ctx.env.DB, input.setId);
      if (!set) throw new Error('Set not found');
      const accounts = await listCompetitorAccounts(ctx.env.DB, input.setId);
      return { set, accounts };
    }),

  // ── Delete a set (cascades to accounts, runs, posts) ───────────────────
  deleteSet: protectedProcedure
    .input(z.object({ setId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await deleteCompetitorSet(ctx.env.DB, input.setId);
      return { ok: true };
    }),

  // ── Delete a single run (cascades to account_runs + posts) ────────────
  deleteRun: protectedProcedure
    .input(z.object({ runId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await deleteCompetitorRun(ctx.env.DB, input.runId);
      return { ok: true };
    }),

  // ── Start a new analysis run ────────────────────────────────────────────
  // Creates or updates a set, then enqueues one scrape job per account.
  startRun: protectedProcedure
    .input(z.object({
      setName:  z.string().default('Untitled'),
      setId:    z.string().optional(), // if provided, overwrite accounts
      accounts: z.array(accountInputSchema).min(1).max(10),
      fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
      toDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const now = new Date().toISOString();

      // 1. Create or reuse the competitor set
      let setId = input.setId;
      let existingAccounts: Awaited<ReturnType<typeof listCompetitorAccounts>> = [];
      if (setId) {
        await touchCompetitorSet(ctx.env.DB, setId);
        // Load existing accounts so we can reuse their IDs — deleting and recreating
        // them cascades to account_runs and competitor_posts, wiping all run history.
        existingAccounts = await listCompetitorAccounts(ctx.env.DB, setId);
      } else {
        setId = generateId();
        await insertCompetitorSet(ctx.env.DB, { id: setId, name: input.setName, created_at: now, updated_at: now });
      }

      // 2. Upsert accounts — reuse existing IDs (matched by handle) to preserve
      //    the competitor_account_runs → competitor_posts cascade chain for old runs.
      const accountIds: string[] = [];
      for (let i = 0; i < input.accounts.length; i++) {
        const a = input.accounts[i]!;
        // Safety net: always derive platform from the handle so LinkedIn URLs
        // are routed correctly even if the frontend sent the wrong value.
        const platform = detectCompetitorPlatform(a.handle);

        const existing = existingAccounts.find(ea => ea.handle === a.handle);
        if (existing) {
          // Reuse the same account ID — keeps all historical account_runs intact
          accountIds.push(existing.id);
          await updateCompetitorAccountMeta(ctx.env.DB, existing.id, a.label, i);
        } else {
          const accountId = generateId();
          accountIds.push(accountId);
          await insertCompetitorAccount(ctx.env.DB, {
            id: accountId,
            set_id: setId,
            label: a.label,
            handle: a.handle,
            platform,
            is_self: a.is_self ? 1 : 0,
            sort_order: i,
            created_at: now,
          });
        }
      }

      // 3. Create the run record.
      //    NOTE: Steps 3 and 4 are not wrapped in a D1 batch transaction.
      //    A Worker crash between these steps would leave an orphaned run with no account_runs.
      //    TODO: Refactor to use db.batch([stmt1, stmt2, ...]) for atomic commit once
      //    the insert helpers expose their D1PreparedStatement objects.
      const runId = generateId();
      await insertCompetitorRun(ctx.env.DB, {
        id: runId,
        set_id: setId,
        status: 'running',
        triggered_at: now,
        completed_at: null,
      });

      // 4. Create an account_run record for each account and enqueue
      for (let i = 0; i < input.accounts.length; i++) {
        const accountRunId = generateId();
        await insertCompetitorAccountRun(ctx.env.DB, {
          id: accountRunId,
          run_id: runId,
          account_id: accountIds[i]!,
          status: 'pending',
          followers: null,
          following: null,
          profile_pic_url: null,
          avg_likes: null,
          avg_comments: null,
          avg_views: null,
          avg_engagement: null,
          avg_engagement_rate: null,
          error: null,
          completed_at: null,
        });

        // Enqueue competitor scrape job
        const job: CompetitorJob = {
          type: 'competitor',
          accountRunId,
          handle:   input.accounts[i]!.handle,
          platform: detectCompetitorPlatform(input.accounts[i]!.handle),
          runId,
          fromDate: input.fromDate,
          toDate:   input.toDate,
        };
        await ctx.env.SCRAPE_QUEUE.send(job);
      }

      return { runId, setId };
    }),

  // ── Poll run + per-account status ────────────────────────────────────────
  getRunStatus: protectedProcedure
    .input(z.object({ runId: z.string() }))
    .query(async ({ input, ctx }) => {
      const run = await getCompetitorRun(ctx.env.DB, input.runId);
      if (!run) throw new Error('Run not found');
      const accountRuns = await listCompetitorAccountRuns(ctx.env.DB, input.runId);
      const accounts    = await listCompetitorAccounts(ctx.env.DB, run.set_id);

      const accountMap = new Map(accounts.map(a => [a.id, a]));
      const progress = accountRuns.map(ar => ({
        accountRunId: ar.id,
        label:  accountMap.get(ar.account_id)?.label ?? ar.account_id,
        handle: accountMap.get(ar.account_id)?.handle ?? '',
        status: ar.status,
        error:  ar.error,
      }));

      return { run, progress };
    }),

  // ── List runs for a set (for date-based history) ─────────────────────────
  listRuns: protectedProcedure
    .input(z.object({ setId: z.string() }))
    .query(async ({ input, ctx }) => {
      return listCompetitorRuns(ctx.env.DB, input.setId);
    }),

  // ── Get full results for a completed run ──────────────────────────────────
  getRunResults: protectedProcedure
    .input(z.object({ runId: z.string() }))
    .query(async ({ input, ctx }) => {
      const run = await getCompetitorRun(ctx.env.DB, input.runId);
      if (!run) throw new Error('Run not found');
      const results = await getFullRunResults(ctx.env.DB, input.runId);
      return { run, results };
    }),

  // ── R2-backed accumulating HTML report ───────────────────────────────────
  getHtmlReport: protectedProcedure
    .input(z.object({ setId: z.string() }))
    .query(async ({ input, ctx }) => {
      const obj = await ctx.env.EXPORTS_BUCKET?.get(`competitor-reports/${input.setId}.html`);
      return { html: obj ? await obj.text() : null };
    }),

  saveHtmlReport: protectedProcedure
    .input(z.object({ setId: z.string(), html: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await ctx.env.EXPORTS_BUCKET?.put(
        `competitor-reports/${input.setId}.html`,
        input.html,
        { httpMetadata: { contentType: 'text/html' } },
      );
      return { ok: true };
    }),

  // ── Generate per-chart AI insights for a completed run ───────────────────
  generateInsights: protectedProcedure
    .input(z.object({ runId: z.string() }))
    .query(async ({ input, ctx }) => {
      const results = await getFullRunResults(ctx.env.DB, input.runId);
      return buildCompetitorFallbackInsights(results);
    }),

  // ── Update categorisation fields on a competitor post ────────────────────
  updatePost: protectedProcedure
    .input(z.object({
      postId:         z.string(),
      content_bucket: z.string().optional(),
      sub_bucket:     z.string().optional(),
      tags:           z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { postId, ...fields } = input;
      await updateCompetitorPost(ctx.env.DB, postId, fields);
      return { ok: true };
    }),
});
