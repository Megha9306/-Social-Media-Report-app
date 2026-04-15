import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { getPostById, getPostsDueForScrape, getFailedPosts, updatePost, getMetricsByPostId, upsertMetrics, insertSnapshot, updatePostTypeCategory, updatePostUploaderHandle, updatePostUploaderInfo } from '../../db/queries';
import type { Post } from '../../db/queries';
import { ApifyProvider } from '../../services/scrapers/apify/provider';
import { groupIntoBatches, calculateNextScrape, STORY_EXPIRED_SENTINEL } from '../../services/scheduler';
import { getProvider } from '../../services/scrapers/index';
import { buildMetricsFromScrape } from '../../services/metrics';
import { generateId } from '../../utils/id';
import { invalidateReportCache } from '../../services/cache';
import type { ScrapeEvent } from '../../durable-objects/scrape-status';
import type { NormalizedMetrics } from '../../services/scrapers/interface';
import type { ProfileScrapeJob } from '../../types/env';
import { safeJsonParse } from '../../utils/json';

type DoStub = { broadcast(e: ScrapeEvent): Promise<void> };

async function handleScrapeError(
  err: unknown,
  postId: string,
  env: import('../../types/env').Env,
  doStub: DoStub,
): Promise<void> {
  const errMsg = err instanceof Error ? err.message : 'Direct scrape failed';
  const isUsageLimit = errMsg.includes('platform-feature-disabled') || errMsg.includes('hard limit');
  if (isUsageLimit) {
    try { await env.REPORT_CACHE.put('apify:usage_limit', errMsg, { expirationTtl: 86_400 }); } catch {}
  }
  const nextScrapeAt = new Date(Date.now() + (isUsageLimit ? 86_400_000 : 7_200_000)).toISOString();
  console.error(`Direct scrape failed for ${postId}:`, err);
  await updatePost(env.DB, postId, {
    scrape_status: 'failed',
    last_error: errMsg,
    next_scrape_at: nextScrapeAt,
  });
  try { await doStub.broadcast({ type: 'failed', postIds: [postId], timestamp: new Date().toISOString() }); } catch {}
}

export function getDoStub(env: import('../../types/env').Env): DoStub {
  const doId = env.SCRAPE_STATUS.idFromName('global');
  return env.SCRAPE_STATUS.get(doId) as unknown as DoStub;
}

/**
 * Detects and stores the post type category for an Instagram post,
 * then queues a profile scrape job to fetch the uploader's follower count.
 */
export async function applyInstagramOwnerData(
  postId: string,
  normalized: NormalizedMetrics,
  connectedHandle: string | null,
  env: import('../../types/env').Env,
): Promise<void> {
  const owner = normalized.ownerUsername?.toLowerCase();

  // Store uploader handle immediately
  if (owner) {
    await updatePostUploaderHandle(env.DB, postId, owner);

    // Queue profile scrape to get follower count asynchronously.
    // Falls back to inline scrape (with 24h KV cache) if the queue is unavailable.
    let queued = false;
    try {
      const profileJob: ProfileScrapeJob = { type: 'profile_scrape', handle: owner, postId };
      await env.SCRAPE_QUEUE.send(profileJob as unknown as Parameters<typeof env.SCRAPE_QUEUE.send>[0]);
      queued = true;
    } catch (e) { console.error('SCRAPE_QUEUE.send failed, falling back to inline profile scrape:', e); }

    if (!queued) {
      try {
        const cacheKey = `profile:${owner}`;
        const cached = await env.REPORT_CACHE.get(cacheKey);
        if (cached !== null) {
          // Re-use cached follower count — no extra Apify call
          await updatePostUploaderInfo(env.DB, postId, owner, parseInt(cached, 10));
        } else {
          // First fetch for this handle today — call Apify and cache for 24h
          const igRaw = await env.REPORT_CACHE.get('settings:ig_connection');
          const igCreds = safeJsonParse<{ handle: string; password: string } | null>(igRaw, null);
          const credentials = igCreds ? { loginUsername: igCreds.handle, loginPassword: igCreds.password } : undefined;
          const provider = new ApifyProvider('Instagram', env.APIFY_TOKEN, credentials);
          const { followers } = await provider.scrapeProfile(owner);
          if (followers !== null) {
            await updatePostUploaderInfo(env.DB, postId, owner, followers);
            await env.REPORT_CACHE.put(cacheKey, String(followers), { expirationTtl: 86400 });
          }
        }
      } catch (e) { console.error('Inline profile scrape failed:', e); }
    }
  }

  // Detect post type category if a connected IG account is configured
  if (connectedHandle) {
    const connected = connectedHandle.toLowerCase();
    const coauthors = normalized.coauthorHandles?.map(h => h.toLowerCase()) ?? [];
    const tagged    = normalized.taggedUserHandles?.map(h => h.toLowerCase()) ?? [];

    let category: 'own_post' | 'collab' | 'tagged' | 'non_tagged';
    if (owner === connected)                category = 'own_post';
    else if (coauthors.includes(connected)) category = 'collab';
    else if (tagged.includes(connected))    category = 'tagged';
    else                                    category = 'non_tagged';

    await updatePostTypeCategory(env.DB, postId, category);
  }
}

export async function directScrapePost(
  postId: string,
  env: import('../../types/env').Env,
  doStub: DoStub,
  existingPost?: Post,
  targetCompany?: string,
): Promise<void> {
  try { await doStub.broadcast({ type: 'scraping', postIds: [postId], timestamp: new Date().toISOString() }); } catch {}

  const post = existingPost ?? await getPostById(env.DB, postId);
  if (!post) {
    try { await doStub.broadcast({ type: 'failed', postIds: [postId], timestamp: new Date().toISOString() }); } catch {}
    return;
  }

  const igRaw = post.platform === 'Instagram' ? await env.REPORT_CACHE.get('settings:ig_connection') : null;
  const igCreds = safeJsonParse<{ handle: string; password: string } | null>(igRaw, null);
  const credentials = igCreds ? { loginUsername: igCreds.handle, loginPassword: igCreds.password } : undefined;
  const provider = getProvider(post.platform, env.APIFY_TOKEN, credentials);
  const results = await provider.batchScrape([post.post_url]);

  if (results.length === 0) {
    const failCount = (post.fail_count ?? 0) + 1;
    await updatePost(env.DB, post.id, {
      scrape_status: failCount >= 5 ? 'post_deleted' : 'failed',
      fail_count: failCount,
      last_error: 'No results from scraper',
    });
    try { await doStub.broadcast({ type: 'failed', postIds: [postId], timestamp: new Date().toISOString() }); } catch {}
    return;
  }

  // Match result to post by URL
  const normalized = results[0]!;
  const existing = await getMetricsByPostId(env.DB, post.id);
  const metrics = buildMetricsFromScrape(post.id, normalized, existing);
  await upsertMetrics(env.DB, metrics);

  // Snapshot for trend
  await insertSnapshot(env.DB, {
    id: generateId(),
    post_id: post.id,
    scraped_at: new Date().toISOString(),
    likes: metrics.likes,
    comments: metrics.comments,
    shares: metrics.shares,
    saves: metrics.saves,
    views: metrics.views,
    impressions: metrics.impressions,
    reach: metrics.reach,
    clicks: metrics.clicks,
  });

  const nextScrape = calculateNextScrape(post, metrics, existing);

  if (nextScrape === STORY_EXPIRED_SENTINEL) {
    await updatePost(env.DB, post.id, {
      scrape_status: 'expired',
      lock: 1,
      fail_count: 0,
      last_error: null,
      post_published_at: normalized.publishedAt ?? post.post_published_at,
    });
  } else {
    await updatePost(env.DB, post.id, {
      scrape_status: 'success',
      fail_count: 0,
      last_error: null,
      post_published_at: normalized.publishedAt ?? post.post_published_at,
    });
  }

  // If a target company was provided, check caption for a mention and set tagged accordingly
  if (targetCompany && normalized.caption) {
    const tagged = normalized.caption.toLowerCase().includes(targetCompany.toLowerCase()) ? 1 : 0;
    try { await updatePost(env.DB, post.id, { tagged }); } catch (e) { console.error('tagged update failed:', e); }
  }

  // Apply Instagram owner data (post type category + uploader handle + queue profile scrape)
  // Wrapped in try/catch so queue/KV errors don't overwrite the success status
  if (post.platform === 'Instagram' && normalized) {
    try { await applyInstagramOwnerData(post.id, normalized, igCreds?.handle ?? null, env); } catch (e) { console.error('applyInstagramOwnerData failed:', e); }
  }

  try { await invalidateReportCache(env.REPORT_CACHE); } catch (e) { console.error('invalidateReportCache failed:', e); }
  try { await doStub.broadcast({ type: 'completed', postIds: [postId], timestamp: new Date().toISOString() }); } catch {}
}

export const scrapeRouter = router({
  triggerOne: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const post = await getPostById(ctx.env.DB, input.id);
      if (!post) throw new Error('Post not found');
      if (post.lock) throw new Error('Post is locked');

      await updatePost(ctx.env.DB, post.id, { scrape_status: 'pending' });

      const doStub = getDoStub(ctx.env);
      ctx.executionCtx.waitUntil(
        directScrapePost(post.id, ctx.env, doStub).catch(err =>
          handleScrapeError(err, post.id, ctx.env, doStub)
        )
      );

      return { queued: true };
    }),

  triggerAll: protectedProcedure
    .mutation(async ({ ctx }) => {
      const posts = await getPostsDueForScrape(ctx.env.DB, 500);
      if (posts.length === 0) return { batches: 0, posts: 0 };

      const doStub = getDoStub(ctx.env);
      ctx.executionCtx.waitUntil(
        Promise.all(
          posts.map(post =>
            directScrapePost(post.id, ctx.env, doStub).catch(err =>
              handleScrapeError(err, post.id, ctx.env, doStub)
            )
          )
        )
      );

      const batches = groupIntoBatches(posts);
      return { batches: batches.length, posts: posts.length };
    }),

  triggerPlatform: protectedProcedure
    .input(z.object({ platform: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const all = await getPostsDueForScrape(ctx.env.DB, 500);
      const filtered = all.filter(p => p.platform === input.platform);

      const doStub = getDoStub(ctx.env);
      ctx.executionCtx.waitUntil(
        Promise.all(
          filtered.map(post =>
            directScrapePost(post.id, ctx.env, doStub).catch(err =>
              handleScrapeError(err, post.id, ctx.env, doStub)
            )
          )
        )
      );

      const batches = groupIntoBatches(filtered);
      return { batches: batches.length, posts: filtered.length };
    }),

  triggerFailed: protectedProcedure
    .mutation(async ({ ctx }) => {
      const posts = await getFailedPosts(ctx.env.DB);
      if (posts.length === 0) return { posts: 0 };

      const doStub = getDoStub(ctx.env);
      ctx.executionCtx.waitUntil(
        Promise.all(
          posts.map(async post => {
            await updatePost(ctx.env.DB, post.id, { fail_count: 0 });
            return directScrapePost(post.id, ctx.env, doStub).catch(err =>
              handleScrapeError(err, post.id, ctx.env, doStub)
            );
          })
        )
      );

      return { posts: posts.length };
    }),

  getUsageLimit: protectedProcedure
    .query(async ({ ctx }) => {
      const raw = await ctx.env.REPORT_CACHE.get('apify:usage_limit');
      return { hit: raw !== null, message: raw };
    }),

  clearUsageLimit: protectedProcedure
    .mutation(async ({ ctx }) => {
      await ctx.env.REPORT_CACHE.delete('apify:usage_limit');
      return { ok: true };
    }),
});
