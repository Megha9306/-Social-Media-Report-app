import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import {
  insertPost, getPostById, getPostByUrl, updatePost, deletePost,
  listPostsWithMetrics, getMetricsByPostId, upsertMetrics, getSnapshots,
} from '../../db/queries';
import type { Post } from '../../db/queries';
import { detectPlatform, detectFormat, normalizeUrl, extractExternalId, extractUploaderHandle, validateUrl } from '../../utils/urlProcessor';
import { buildMetricsFromManualEntry } from '../../services/metrics';
import { generateId } from '../../utils/id';
import { directScrapePost, getDoStub } from './scrape';

const PLATFORMS = ['Instagram', 'Facebook', 'Twitter', 'LinkedIn', 'YouTube'] as const;
const FORMATS   = ['Static', 'Carousel', 'Gif', 'Reel', 'Video Post', 'Story', 'Article'] as const;

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}/;

const createPostSchema = z.object({
  post_url:       z.string().url(),
  platform:       z.enum(PLATFORMS).optional(),
  format:         z.enum(FORMATS).optional(),
  content_bucket: z.string().optional(),
  sub_bucket:     z.string().optional(),
  campaign:       z.string().optional(),
  tags:           z.string().optional(),
  post_published_at: z.string().regex(ISO_DATE_REGEX, 'Must be an ISO date').optional(),
  target_company: z.string().optional(),
});

const updatePostSchema = z.object({
  id:             z.string(),
  platform:       z.enum(PLATFORMS).optional(),
  format:         z.enum(FORMATS).optional(),
  content_bucket: z.string().optional(),
  sub_bucket:     z.string().optional(),
  campaign:       z.string().optional(),
  tags:           z.string().optional(),
  lock:           z.number().optional(),
  post_published_at: z.string().regex(ISO_DATE_REGEX, 'Must be an ISO date').optional(),
});

const manualMetricsSchema = z.object({
  post_id:     z.string(),
  impressions: z.number().int().nonnegative().optional(),
  reach:       z.number().int().nonnegative().optional(),
  clicks:      z.number().int().nonnegative().optional(),
});

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
  tags:           z.string().optional(),
});

async function createSinglePost(env: Parameters<typeof insertPost>[0], input: z.infer<typeof createPostSchema>): Promise<Post> {
  const normalizedUrl = normalizeUrl(input.post_url);

  const existing = await getPostByUrl(env, normalizedUrl);
  if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'This post URL already exists in the system.' });

  const platform = input.platform ?? detectPlatform(input.post_url);
  if (!platform) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Could not detect platform from URL. Please select one manually.' });

  const format = input.format ?? detectFormat(input.post_url, platform as Parameters<typeof detectFormat>[1]);
  if (!format) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Could not detect format from URL. Please select one manually.' });

  const id = generateId();
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const post: Post = {
    id,
    platform,
    format,
    content_bucket: input.content_bucket ?? null,
    sub_bucket:     input.sub_bucket     ?? null,
    campaign:       input.campaign       ?? null,
    tags:           input.tags           ?? null,
    post_url:       input.post_url,
    post_url_normalized: normalizedUrl,
    post_id_external: extractExternalId(input.post_url, platform as Parameters<typeof extractExternalId>[1]),
    post_published_at: input.post_published_at ?? null,
    lock:           0,
    scrape_status:  'pending',
    last_error:     null,
    fail_count:     0,
    next_scrape_at: now,
    created_at:     now,
    updated_at:     now,
    post_type_category: null,
    uploader_handle:    extractUploaderHandle(input.post_url, platform as Parameters<typeof extractUploaderHandle>[1]),
    uploader_followers: null,
    brand_id:           null,
    tagged:             0,
    data_origin:        'manual',
  };

  await insertPost(env, post);
  return post;
}

export const postsRouter = router({
  create: protectedProcedure
    .input(createPostSchema)
    .mutation(async ({ input, ctx }) => {
      const post = await createSinglePost(ctx.env.DB, input);
      // Auto-scrape immediately after adding — pass the already-fetched post to avoid a re-query
      const doStub = getDoStub(ctx.env);
      ctx.executionCtx.waitUntil(
        directScrapePost(post.id, ctx.env, doStub, post, input.target_company).catch(async (err) => {
          console.error(`Auto-scrape failed for ${post.id}:`, err);
          await updatePost(ctx.env.DB, post.id, {
            scrape_status: 'failed',
            last_error: err instanceof Error ? err.message : 'Auto-scrape failed',
          });
        })
      );
      return { id: post.id };
    }),

  bulkCreate: protectedProcedure
    .input(z.object({ urls: z.array(z.string().url()).max(200) }))
    .mutation(async ({ input, ctx }) => {
      const results: Array<{ url: string; id?: string; error?: string }> = [];
      const doStub = getDoStub(ctx.env);
      for (const url of input.urls) {
        try {
          const post = await createSinglePost(ctx.env.DB, { post_url: url });
          results.push({ url, id: post.id });
          // Auto-scrape each post immediately — pass the already-fetched post to avoid a re-query
          ctx.executionCtx.waitUntil(
            directScrapePost(post.id, ctx.env, doStub, post).catch(async (err) => {
              await updatePost(ctx.env.DB, post.id, {
                scrape_status: 'failed',
                last_error: err instanceof Error ? err.message : 'Auto-scrape failed',
              });
            })
          );
        } catch (e) {
          results.push({ url, error: (e as Error).message });
        }
      }
      return { results };
    }),

  list: protectedProcedure
    .input(filterSchema)
    .query(async ({ input, ctx }) => {
      return listPostsWithMetrics(ctx.env.DB, input);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const post = await getPostById(ctx.env.DB, input.id);
      if (!post) throw new Error('Post not found');
      return post;
    }),

  update: protectedProcedure
    .input(updatePostSchema)
    .mutation(async ({ input, ctx }) => {
      const { id, ...fields } = input;
      await updatePost(ctx.env.DB, id, fields as Parameters<typeof updatePost>[2]);
      return { ok: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await deletePost(ctx.env.DB, input.id);
      return { ok: true };
    }),

  updateMetrics: protectedProcedure
    .input(manualMetricsSchema)
    .mutation(async ({ input, ctx }) => {
      const existing = await getMetricsByPostId(ctx.env.DB, input.post_id);
      if (!existing) throw new Error('No metrics found for this post');
      const updated = buildMetricsFromManualEntry(existing, {
        impressions: input.impressions,
        reach:       input.reach,
        clicks:      input.clicks,
      });
      await upsertMetrics(ctx.env.DB, updated);
      return { ok: true };
    }),

  detectUrl: protectedProcedure
    .input(z.object({ url: z.string() }))
    .query(async ({ input }) => {
      const platform = detectPlatform(input.url);
      const format   = platform ? detectFormat(input.url, platform as Parameters<typeof detectFormat>[1]) : null;
      return { platform, format };
    }),

  validateUrl: protectedProcedure
    .input(z.object({ url: z.string() }))
    .query(async ({ input }) => {
      const valid = await validateUrl(input.url);
      return { valid };
    }),

  snapshots: protectedProcedure
    .input(z.object({ postId: z.string() }))
    .query(async ({ input, ctx }) => {
      return getSnapshots(ctx.env.DB, input.postId);
    }),
});
