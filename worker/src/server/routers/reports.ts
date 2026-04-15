import { z } from 'zod';
import { router, protectedProcedure, publicProcedure } from '../trpc';
import {
  listPostsWithMetrics, getSnapshots, getDistinctCampaigns, getPostsDueForScrape,
  getAnalyticsMOM, getFormatDeliveredMOM, getBucketAnalysis, getBucketMOM,
  getDistinctContentBuckets, listPostsWithMetricsSorted,
} from '../../db/queries';
import { buildCacheKey, getCached, setCached } from '../../services/cache';
import { buildAnalysisFallbackInsights } from '../../services/insights';

const filterSchema = z.object({
  platform:       z.string().optional(),
  format:         z.string().optional(),
  content_bucket: z.string().optional(),
  campaign:       z.string().optional(),
  date_from:      z.string().optional(),
  date_to:        z.string().optional(),
  limit:          z.number().int().min(1).max(1000).optional(),
  offset:         z.number().int().min(0).optional(),
  brand_id:       z.string().optional(),
  tagged:         z.boolean().optional(),
  data_origin:    z.enum(['manual', 'scraped']).optional(),
});

export const reportsRouter = router({
  filtered: protectedProcedure
    .input(filterSchema)
    .query(async ({ input, ctx }) => {
      const cacheKey = buildCacheKey(input);
      const cached = await getCached<ReturnType<typeof listPostsWithMetrics>>(ctx.env.REPORT_CACHE, cacheKey);
      if (cached) return cached;

      const results = await listPostsWithMetrics(ctx.env.DB, input);
      await setCached(ctx.env.REPORT_CACHE, cacheKey, results);
      return results;
    }),

  totals: protectedProcedure
    .input(filterSchema)
    .query(async ({ input, ctx }) => {
      const posts = await listPostsWithMetrics(ctx.env.DB, { ...input, limit: 5000 });

      let totalPosts = 0;
      let totalReach = 0;
      let totalLikes = 0;
      let totalComments = 0;
      let totalShares = 0;
      let totalSaves = 0;
      let totalViews = 0;
      let totalImpressions = 0;
      let totalClicks = 0;
      let totalActiveEng = 0;
      let totalPassiveEng = 0;
      let weightedEngRate = 0;
      let engRateWeight = 0;
      let scrapedToday = 0;

      const today = new Date().toISOString().slice(0, 10);

      for (const p of posts) {
        totalPosts++;
        const m = p.metrics;
        if (!m) continue;

        totalReach       += m.reach        ?? 0;
        totalLikes       += m.likes        ?? 0;
        totalComments    += m.comments     ?? 0;
        totalShares      += m.shares       ?? 0;
        totalSaves       += m.saves        ?? 0;
        totalViews       += m.views        ?? 0;
        totalImpressions += m.impressions  ?? 0;
        totalClicks      += m.clicks       ?? 0;
        totalActiveEng   += m.active_eng   ?? 0;
        totalPassiveEng  += m.passive_eng  ?? 0;

        if (m.active_eng_rate != null && m.reach) {
          weightedEngRate += m.active_eng_rate * m.reach;
          engRateWeight   += m.reach;
        }

        if (m.scraped_at?.startsWith(today)) scrapedToday++;
      }

      const avgEngRate = engRateWeight > 0 ? weightedEngRate / engRateWeight : null;

      return {
        totalPosts,
        totalReach,
        totalLikes,
        totalComments,
        totalShares,
        totalSaves,
        totalViews,
        totalImpressions,
        totalClicks,
        totalActiveEng,
        totalPassiveEng,
        avgEngRate,
        scrapedToday,
      };
    }),

  sparkline: protectedProcedure
    .input(z.object({ postId: z.string() }))
    .query(async ({ input, ctx }) => {
      return getSnapshots(ctx.env.DB, input.postId, 30);
    }),

  campaigns: protectedProcedure
    .query(async ({ ctx }) => {
      return getDistinctCampaigns(ctx.env.DB);
    }),

  health: publicProcedure
    .query(async ({ ctx }) => {
      const due = await getPostsDueForScrape(ctx.env.DB, 1000);
      const all = await listPostsWithMetrics(ctx.env.DB, { limit: 5000 });

      const total      = all.length;
      const pending    = all.filter(p => p.scrape_status === 'pending').length;
      const failed     = all.filter(p => p.scrape_status === 'failed').length;
      const deleted    = all.filter(p => p.scrape_status === 'post_deleted').length;
      const dueCount   = due.length;

      const lastScrape = all
        .map(p => p.metrics?.scraped_at)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null;

      return { total, pending, failed, deleted, dueCount, lastScrape };
    }),

  analyticsMOM: protectedProcedure
    .input(filterSchema)
    .query(async ({ input, ctx }) => {
      return getAnalyticsMOM(ctx.env.DB, input);
    }),

  deliveredSOW: protectedProcedure
    .input(filterSchema)
    .query(async ({ input, ctx }) => {
      return getFormatDeliveredMOM(ctx.env.DB, input);
    }),

  bucketAnalysis: protectedProcedure
    .input(filterSchema)
    .query(async ({ input, ctx }) => {
      return getBucketAnalysis(ctx.env.DB, input);
    }),

  bucketMOM: protectedProcedure
    .input(filterSchema)
    .query(async ({ input, ctx }) => {
      return getBucketMOM(ctx.env.DB, input);
    }),

  contentBuckets: protectedProcedure
    .query(async ({ ctx }) => {
      return getDistinctContentBuckets(ctx.env.DB);
    }),

  topPosts: protectedProcedure
    .input(filterSchema.extend({
      sortBy:  z.enum(['active_eng_rate', 'passive_eng_rate', 'views', 'likes', 'impressions', 'weighted_score']).optional().default('weighted_score'),
      sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
      limit:   z.number().int().min(1).max(50).optional().default(5),
    }))
    .query(async ({ input, ctx }) => {
      const { sortBy, sortDir, ...filters } = input;
      return listPostsWithMetricsSorted(ctx.env.DB, filters, sortBy, sortDir);
    }),

  // ── Generate per-chart AI insights for the analysis page ─────────────────
  generateInsights: protectedProcedure
    .input(filterSchema)
    .query(async ({ input, ctx }) => {
      // Fetch all required data in parallel
      const [momData, sowData, bucketData, bucketMOMData, topPostsData, bottomPostsData] = await Promise.all([
        getAnalyticsMOM(ctx.env.DB, input),
        getFormatDeliveredMOM(ctx.env.DB, input),
        getBucketAnalysis(ctx.env.DB, input),
        getBucketMOM(ctx.env.DB, input),
        listPostsWithMetricsSorted(ctx.env.DB, { ...input, limit: 5 }, 'weighted_score', 'desc'),
        listPostsWithMetricsSorted(ctx.env.DB, { ...input, limit: 5 }, 'weighted_score', 'asc'),
      ]);

      const fallbackInsights = buildAnalysisFallbackInsights({
        momData,
        sowData,
        bucketData,
        bucketMOMData,
        topPosts: topPostsData,
        bottomPosts: bottomPostsData,
      });
      return fallbackInsights;
    }),

});
