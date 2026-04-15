import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import {
  insertBrand, getBrand, getBrandByUrl, listBrands, updateBrand, deleteBrand,
} from '../../db/brand-queries';
import { generateId } from '../../utils/id';
import type { BrandScrapeJob } from '../../types/env';

// ─── URL helpers ──────────────────────────────────────────────────────────────

function detectBrandPlatform(url: string): 'Instagram' | 'Facebook' | 'LinkedIn' | null {
  if (/instagram\.com/i.test(url)) return 'Instagram';
  if (/facebook\.com/i.test(url)) return 'Facebook';
  if (/linkedin\.com\/company/i.test(url)) return 'LinkedIn';
  return null;
}

function extractBrandHandle(url: string, platform: string): string {
  let h = url.trim();
  // strip protocol + domain
  h = h.replace(/^https?:\/\/(www\.)?/i, '');
  if (platform === 'Instagram') h = h.replace(/^instagram\.com\//i, '');
  else if (platform === 'Facebook') h = h.replace(/^facebook\.com\//i, '');
  else if (platform === 'LinkedIn') h = h.replace(/^linkedin\.com\/company\//i, '');
  // take first path segment, strip trailing slash and query
  const segment = h.split('/')[0] ?? '';
  h = (segment.split('?')[0] ?? '').toLowerCase();
  return h || url;
}

function normalizeProfileUrl(url: string): string {
  // Ensure trailing slash for consistency
  const u = url.trim().replace(/\/?$/, '/');
  return u.startsWith('http') ? u : `https://${u}`;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const brandsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return listBrands(ctx.env.DB);
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const brand = await getBrand(ctx.env.DB, input.id);
      if (!brand) throw new Error('Brand not found');
      return brand;
    }),

  create: protectedProcedure
    .input(z.object({
      profile_url: z.string().url(),
      name:        z.string().optional(),
      from_date:   z.string().optional(),
      to_date:     z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const profileUrl = normalizeProfileUrl(input.profile_url);

      // Deduplicate
      const existing = await getBrandByUrl(ctx.env.DB, profileUrl);
      if (existing) return { id: existing.id, alreadyExists: true };

      const platform = detectBrandPlatform(profileUrl);
      if (!platform) throw new Error('Unsupported platform. Paste an Instagram, Facebook, or LinkedIn company URL.');

      const handle = extractBrandHandle(profileUrl, platform);
      const id = generateId();
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const name = input.name?.trim() || handle;

      await insertBrand(ctx.env.DB, {
        id, name, platform, profile_url: profileUrl, handle,
        followers: null, total_posts: 0, tagged_posts: 0, non_tagged_posts: 0,
        total_reach: 0, avg_eng_rate: null, last_scraped: null,
        scrape_status: 'scraping', created_at: now, updated_at: now,
      });

      const job: BrandScrapeJob = {
        type: 'brand_scrape', brandId: id, platform, profileUrl, handle,
        fromDate: input.from_date,
        toDate: input.to_date,
      };
      await ctx.env.SCRAPE_QUEUE.send(job);

      return { id, alreadyExists: false };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await deleteBrand(ctx.env.DB, input.id);
      return { ok: true };
    }),

  triggerScrape: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const brand = await getBrand(ctx.env.DB, input.id);
      if (!brand) throw new Error('Brand not found');

      await updateBrand(ctx.env.DB, input.id, { scrape_status: 'scraping' });

      const job: BrandScrapeJob = {
        type: 'brand_scrape',
        brandId: brand.id,
        platform: brand.platform,
        profileUrl: brand.profile_url,
        handle: brand.handle ?? '',
      };
      await ctx.env.SCRAPE_QUEUE.send(job);

      return { ok: true };
    }),
});
