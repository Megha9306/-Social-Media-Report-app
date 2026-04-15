import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import type { Env, ScrapeJob, CompetitorJob, ProfileScrapeJob, BrandScrapeJob } from './types/env';
import { appRouter } from './server/routers/index';
import { getPostsDueForScrape, getAllActivePosts, getPostById, updatePost, getMetricsByPostId, upsertMetrics, insertSnapshot, updatePostUploaderInfo, insertPost, getPostByUrl } from './db/queries';
import { groupIntoBatches, calculateNextScrape, STORY_EXPIRED_SENTINEL } from './services/scheduler';
import { getProvider } from './services/scrapers/index';
import { buildMetricsFromScrape } from './services/metrics';
import { generateId } from './utils/id';
import { invalidateReportCache } from './services/cache';
import { handleApifyWebhook } from './server/webhooks/apify';
import { applyInstagramOwnerData } from './server/routers/scrape';
import { scrapeCompetitorProfile } from './services/scrapers/apify/competitor-profile';
import { scrapeLinkedInCompetitorProfile } from './services/scrapers/apify/linkedin-competitor-profile';
import { scrapeTwitterCompetitorProfile } from './services/scrapers/apify/twitter-competitor-profile';
import { scrapeFacebookCompetitorProfile } from './services/scrapers/apify/facebook-competitor-profile';
import { scrapeYouTubeCompetitorProfile } from './services/scrapers/apify/youtube-competitor-profile';
import { handleOAuthInit, handleOAuthCallback } from './server/routes/oauth';
import { fetchAndMergeInsights } from './services/insights/index';
import { getConnectedAccountsByPlatform, updateConnectedAccountTokens } from './db/queries';
import { refreshTwitterToken } from './services/oauth/twitter';
import { refreshYouTubeToken } from './services/oauth/youtube';
import { ApifyProvider } from './services/scrapers/apify/provider';
import {
  updateCompetitorAccountRun, insertCompetitorPost, checkRunCompletion, updateCompetitorRunStatus,
} from './db/competitor-queries';
import { updateBrand } from './db/brand-queries';
import { scrapeBrandProfile } from './services/scrapers/apify/brand-profile';
import { handleExportCsv, handleExportDownload } from './server/export';
import { ScrapeStatusDO } from './durable-objects/scrape-status';
import { SchedulerDO }    from './durable-objects/scheduler';
import type { ScrapeEvent } from './durable-objects/scrape-status';
import { normalizeUrl, detectPlatform, detectFormat } from './utils/urlProcessor';
import { safeJsonParse } from './utils/json';

export { ScrapeStatusDO, SchedulerDO };

// Initialized once per Worker instance (resets on cold start, which is fine —
// the DO itself stores the alarm so it survives Worker restarts).
let schedulerBootstrapped = false;

export default {
  // ── Cron trigger ──────────────────────────────────────────────────────────
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    if (event.cron === '0 23 28-31 * *') {
      ctx.waitUntil(runEndOfMonthScrape(env));
    } else {
      ctx.waitUntil(runScheduledScrape(env));
      ctx.waitUntil(refreshExpiringTokens(env));
    }
  },

  // ── Queue consumer: process scrape batches ────────────────────────────────
  async queue(batch: MessageBatch<ScrapeJob | CompetitorJob | ProfileScrapeJob | BrandScrapeJob>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      try {
        const body = msg.body as (ScrapeJob & { type?: string }) | CompetitorJob | ProfileScrapeJob | BrandScrapeJob;
        if (body.type === 'competitor') {
          await processCompetitorJob(body as CompetitorJob, env);
        } else if (body.type === 'profile_scrape') {
          await processProfileScrapeJob(body as ProfileScrapeJob, env);
        } else if (body.type === 'brand_scrape') {
          await processBrandScrapeJob(body as BrandScrapeJob, env);
        } else {
          await processScrapeJob(body as ScrapeJob, env);
        }
        msg.ack();
      } catch (err) {
        console.error('Queue job failed:', err);
        msg.retry();
      }
    }
  },

  // ── HTTP fetch handler: tRPC + webhooks + WebSocket ───────────────────────
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade → Durable Object
    if (url.pathname === '/ws') {
      const doId = env.SCRAPE_STATUS.idFromName('global');
      const stub = env.SCRAPE_STATUS.get(doId);
      return stub.fetch(request);
    }

    // Apify webhook
    if (url.pathname === '/api/webhooks/apify' && request.method === 'POST') {
      return handleApifyWebhook(request, env);
    }

    // CSV export
    if (url.pathname === '/api/export/csv' && request.method === 'GET') {
      return handleExportCsv(request, env);
    }
    if (url.pathname === '/api/export/download' && request.method === 'GET') {
      return handleExportDownload(request, env);
    }

    // OAuth routes: /api/auth/{platform}/init  and  /api/auth/{platform}/callback
    if (url.pathname.startsWith('/api/auth/')) {
      const parts  = url.pathname.split('/');  // ['', 'api', 'auth', '{platform}', '{action}']
      const group  = parts[3] ?? '';
      const action = parts[4] ?? '';
      if (action === 'init')     return handleOAuthInit(group, request, env);
      if (action === 'callback') return handleOAuthCallback(group, request, env);
    }

    // Bootstrap SchedulerDO alarm on first request after cold start.
    // The DO's fetch() is idempotent — it only sets the alarm if not already running.
    if (!schedulerBootstrapped) {
      schedulerBootstrapped = true;
      try {
        const schedId   = env.SCHEDULER.idFromName('global');
        const schedStub = env.SCHEDULER.get(schedId);
        _ctx.waitUntil(schedStub.fetch(new Request('http://internal/init')));
      } catch (e) {
        console.error('[Worker] SchedulerDO bootstrap failed — check wrangler.toml bindings:', e);
      }
    }

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, trpc-batch-mode, x-api-key',
        },
      });
    }

    // tRPC
    if (url.pathname.startsWith('/trpc')) {
      const response = await fetchRequestHandler({
        endpoint: '/trpc',
        req: request,
        router: appRouter,
        createContext: () => ({ env, req: request, executionCtx: _ctx }),
      });

      // Attach CORS headers
      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      return new Response(response.body, { status: response.status, headers });
    }

    return new Response('Not found', { status: 404 });
  },
};

// ── Scheduled scrape logic ────────────────────────────────────────────────────

async function runScheduledScrape(env: Env): Promise<void> {
  const posts = await getPostsDueForScrape(env.DB, 500);
  if (posts.length === 0) return;

  const batches = groupIntoBatches(posts);
  await Promise.all(batches.map(b => env.SCRAPE_QUEUE.send(b)));
  console.log(`Scheduled scrape: queued ${batches.length} batches for ${posts.length} posts`);
}

// ── Queue job processor ───────────────────────────────────────────────────────

async function processScrapeJob(job: ScrapeJob, env: Env): Promise<void> {
  const { platform, urls, postIds } = job;

  // Broadcast "scraping" to all connected WebSocket clients
  const doId = env.SCRAPE_STATUS.idFromName('global');
  const doStub = env.SCRAPE_STATUS.get(doId) as unknown as { broadcast(e: ScrapeEvent): Promise<void> };
  try {
    await doStub.broadcast({ type: 'scraping', postIds, timestamp: new Date().toISOString() });
  } catch {
    // Broadcast is best-effort — don't let it kill the scrape job
  }

  // Poll-based scraping: call Apify, wait for results, update DB directly
  const igRaw = platform === 'Instagram' ? await env.REPORT_CACHE.get('settings:ig_connection') : null;
  const igCreds = safeJsonParse<{ handle: string; password: string } | null>(igRaw, null);
  const credentials = igCreds ? { loginUsername: igCreds.handle, loginPassword: igCreds.password } : undefined;
  const provider = getProvider(platform, env.APIFY_TOKEN, credentials);

  try {
    const results = await provider.batchScrape(urls);

    // Build a map of normalized URL → result for matching
    const resultsByUrl = new Map<string, typeof results[number]>();
    for (const r of results) {
      const norm = normalizeUrl(r.url);
      resultsByUrl.set(norm, r);
    }

    // Process each post
    for (let i = 0; i < postIds.length; i++) {
      const postId  = postIds[i]!;
      const postUrl = urls[i]!;
      const normUrl = normalizeUrl(postUrl);

      // Try to match by normalized URL
      const normalized = resultsByUrl.get(normUrl) ?? results[i] ?? null;

      try {
        if (normalized) {
          const existing = await getMetricsByPostId(env.DB, postId);
          const metrics = buildMetricsFromScrape(postId, normalized, existing);
          await upsertMetrics(env.DB, metrics);

          // Create snapshot for trend tracking
          await insertSnapshot(env.DB, {
            id: generateId(),
            post_id: postId,
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

          const post = await getPostById(env.DB, postId);
          const nextScrape = post ? calculateNextScrape(post, metrics, existing) : null;

          if (nextScrape === STORY_EXPIRED_SENTINEL) {
            // Story has exceeded 24-hour window — mark expired and lock to prevent further scraping or edits
            await updatePost(env.DB, postId, {
              scrape_status: 'expired',
              lock: 1,
              last_error: null,
            });
          } else {
            await updatePost(env.DB, postId, {
              scrape_status: 'success',
              fail_count: 0,
              last_error: null,
              post_published_at: normalized.publishedAt ?? undefined,
              ...(nextScrape ? { next_scrape_at: nextScrape } : {}),
            });
          }

          // Apply Instagram owner data (post type category + uploader handle + queue profile scrape)
          if (platform === 'Instagram') {
            await applyInstagramOwnerData(postId, normalized, igCreds?.handle ?? null, env);
          }

          // Non-blocking: fetch official API metrics if account is connected
          try {
            await fetchAndMergeInsights({ id: postId, platform, url: postUrl }, env.DB);
          } catch { /* insights are optional — never fail the scrape */ }
        } else {
          // No matching result — mark as failed
          const post = await getPostById(env.DB, postId);
          const failCount = (post?.fail_count ?? 0) + 1;
          await updatePost(env.DB, postId, {
            scrape_status: failCount >= 5 ? 'post_deleted' : 'failed',
            fail_count: failCount,
            last_error: 'No results from scraper',
          });
        }
      } catch (postErr) {
        console.error(`Failed to process post ${postId}:`, postErr);
        try {
          await updatePost(env.DB, postId, {
            scrape_status: 'failed',
            last_error: postErr instanceof Error ? postErr.message : 'Processing error',
          });
        } catch { /* best-effort status update */ }
      }
    }

    // Invalidate report cache
    await invalidateReportCache(env.REPORT_CACHE);

    // Broadcast completion
    try { await doStub.broadcast({ type: 'completed', postIds, timestamp: new Date().toISOString() }); } catch {}
    console.log(`Scrape completed for ${platform}: ${results.length} results for ${postIds.length} posts`);

  } catch (err) {
    console.error(`Scrape failed for ${platform}:`, err);
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    const isUsageLimit = errMsg.includes('platform-feature-disabled') || errMsg.includes('hard limit');
    if (isUsageLimit) {
      try { await env.REPORT_CACHE.put('apify:usage_limit', errMsg, { expirationTtl: 86_400 }); } catch {}
    }
    const nextScrapeAt = new Date(Date.now() + (isUsageLimit ? 86_400_000 : 7_200_000)).toISOString();
    for (const postId of postIds) {
      await updatePost(env.DB, postId, {
        scrape_status: 'failed',
        last_error: errMsg,
        next_scrape_at: nextScrapeAt,
      });
    }
    try { await doStub.broadcast({ type: 'failed', postIds, timestamp: new Date().toISOString() }); } catch {}
  }
}

// ── End-of-month force scrape ─────────────────────────────────────────────────

async function runEndOfMonthScrape(env: Env): Promise<void> {
  // Only proceed if today is the actual last day of the month
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (tomorrow.getMonth() === now.getMonth()) {
    console.log('End-of-month cron: not the last day yet, skipping.');
    return;
  }

  const posts = await getAllActivePosts(env.DB);
  if (posts.length === 0) return;

  const batches = groupIntoBatches(posts);
  await Promise.all(batches.map(b => env.SCRAPE_QUEUE.send(b)));
  console.log(`End-of-month scrape: queued ${batches.length} batches for ${posts.length} posts`);
}

// ── Profile scrape job (uploader follower count) ──────────────────────────────

async function processProfileScrapeJob(job: ProfileScrapeJob, env: Env): Promise<void> {
  const { handle, postId } = job;
  try {
    const igRaw = await env.REPORT_CACHE.get('settings:ig_connection');
    const igCreds = safeJsonParse<{ handle: string; password: string } | null>(igRaw, null);
    const credentials = igCreds ? { loginUsername: igCreds.handle, loginPassword: igCreds.password } : undefined;

    const provider = new ApifyProvider('Instagram', env.APIFY_TOKEN, credentials);
    const { followers } = await provider.scrapeProfile(handle);

    if (followers !== null) {
      await updatePostUploaderInfo(env.DB, postId, handle, followers);
      console.log(`Profile scrape: @${handle} — ${followers} followers`);
    }
  } catch (err) {
    console.error(`Profile scrape failed for @${handle}:`, err);
    // Non-critical: uploader_followers stays null, post still has uploader_handle
  }
}

// ── Competitor profile scrape job ─────────────────────────────────────────────

async function processCompetitorJob(job: CompetitorJob, env: Env): Promise<void> {
  const { accountRunId, handle, runId } = job;

  // Mark as running
  await updateCompetitorAccountRun(env.DB, accountRunId, { status: 'running' });

  try {
    const { profile, posts } =
      job.platform === 'linkedin'  ? await scrapeLinkedInCompetitorProfile(handle, env.APIFY_TOKEN, job.fromDate, job.toDate) :
      job.platform === 'twitter'   ? await scrapeTwitterCompetitorProfile(handle, env.APIFY_TOKEN, job.fromDate, job.toDate)  :
      job.platform === 'facebook'  ? await scrapeFacebookCompetitorProfile(handle, env.APIFY_TOKEN, job.fromDate, job.toDate) :
      job.platform === 'youtube'   ? await scrapeYouTubeCompetitorProfile(handle, env.APIFY_TOKEN, job.fromDate, job.toDate)  :
      await scrapeCompetitorProfile(handle, env.APIFY_TOKEN, job.fromDate, job.toDate);

    const followers = profile.followers ?? 0;

    // Calculate aggregates
    const postCount = posts.length;
    const avg = (arr: (number | null)[]) => {
      const valid = arr.filter(v => v != null) as number[];
      return valid.length > 0 ? valid.reduce((s, v) => s + v, 0) / valid.length : null;
    };

    const avgLikes    = avg(posts.map(p => p.likes));
    const avgComments = avg(posts.map(p => p.comments));
    const avgViews    = avg(posts.map(p => p.views));
    const avgEng      = avg(posts.map(p => p.engagement));
    const avgEngRate  = followers > 0 && avgEng != null ? avgEng / followers : null;

    // Store aggregated results on account_run
    await updateCompetitorAccountRun(env.DB, accountRunId, {
      status: 'completed',
      followers: profile.followers,
      following: profile.following,
      profile_pic_url: profile.profilePicUrl,
      avg_likes: avgLikes,
      avg_comments: avgComments,
      avg_views: avgViews,
      avg_engagement: avgEng,
      avg_engagement_rate: avgEngRate,
      completed_at: new Date().toISOString(),
    });

    // Store individual posts
    for (const post of posts) {
      const engRate = followers > 0 ? post.engagement / followers : null;
      await insertCompetitorPost(env.DB, {
        id: generateId(),
        account_run_id: accountRunId,
        post_id_external: post.postIdExternal,
        post_url: post.postUrl,
        post_type: post.postType,
        published_at: post.publishedAt,
        caption: post.caption,
        likes: post.likes,
        comments: post.comments,
        views: post.views,
        engagement: post.engagement,
        engagement_rate: engRate,
        content_bucket: null,
        sub_bucket: null,
        tags: null,
      });
    }

    console.log(`Competitor scrape completed: @${handle} — ${postCount} posts, ${followers} followers`);
  } catch (err) {
    console.error(`Competitor scrape failed for @${handle}:`, err);
    await updateCompetitorAccountRun(env.DB, accountRunId, {
      status: 'failed',
      error: err instanceof Error ? err.message : 'Unknown error',
      completed_at: new Date().toISOString(),
    });
  }

  // Check if all accounts in the run are done, then update run status
  const overallStatus = await checkRunCompletion(env.DB, runId);
  if (overallStatus !== 'running') {
    await updateCompetitorRunStatus(env.DB, runId, overallStatus);
  }
}

// ── Brand profile scrape job ───────────────────────────────────────────────────

async function processBrandScrapeJob(job: BrandScrapeJob, env: Env): Promise<void> {
  const { brandId, platform, profileUrl, handle, fromDate, toDate } = job;

  try {
    const data = await scrapeBrandProfile(platform, profileUrl, handle, env.APIFY_TOKEN, fromDate, toDate);

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    let taggedCount = 0;
    let insertedCount = 0;

    for (const post of data.posts) {
      if (!post.postUrl) continue;

      try {
        const normUrl = normalizeUrl(post.postUrl);

        // Skip if already in DB (could be from manual add or previous scrape)
        const existing = await getPostByUrl(env.DB, normUrl);
        if (existing) {
          // Update brand_id and tagged if not already linked
          if (!existing.brand_id) {
            const tagged = Number(Boolean(post.caption?.toLowerCase().includes(handle.toLowerCase())));
            await updatePost(env.DB, existing.id, { brand_id: brandId, tagged, data_origin: 'scraped' });
            if (tagged) taggedCount++;
          } else {
            if (existing.tagged) taggedCount++;
          }
          insertedCount++;
          continue;
        }

        const detectedPlatform = detectPlatform(post.postUrl) ?? platform;
        const detectedFormat   = detectFormat(post.postUrl, detectedPlatform as Parameters<typeof detectFormat>[1]) ?? post.format ?? 'Static';
        const tagged = Number(Boolean(post.caption?.toLowerCase().includes(handle.toLowerCase())));
        if (tagged) taggedCount++;

        const postId = generateId();
        await insertPost(env.DB, {
          id:                   postId,
          platform:             detectedPlatform,
          format:               detectedFormat,
          content_bucket:       null,
          sub_bucket:           null,
          campaign:             null,
          tags:                 null,
          post_url:             post.postUrl,
          post_url_normalized:  normUrl,
          post_id_external:     post.postIdExternal,
          post_published_at:    post.publishedAt,
          lock:                 0,
          scrape_status:        'success',
          last_error:           null,
          fail_count:           0,
          next_scrape_at:       now,
          created_at:           now,
          updated_at:           now,
          post_type_category:   null,
          uploader_handle:      handle,
          uploader_followers:   data.followers,
          brand_id:             brandId,
          tagged,
          data_origin:          'scraped',
        });

        // Store initial metrics
        await upsertMetrics(env.DB, {
          id:                 generateId(),
          post_id:            postId,
          scraped_at:         now,
          month_date:         now.slice(0, 7),
          likes:              post.likes,
          comments:           post.comments,
          shares:             post.shares ?? 0,
          saves:              0,
          views:              post.views ?? 0,
          others:             0,
          impressions:        null,
          reach:              null,
          clicks:             null,
          ctr:                null,
          vtr:                null,
          active_eng:         post.likes + post.comments,
          active_eng_rate:    data.followers && data.followers > 0
                                ? (post.likes + post.comments) / data.followers
                                : null,
          passive_eng:        (post.shares ?? 0),
          passive_eng_rate:   data.followers && data.followers > 0
                                ? (post.shares ?? 0) / data.followers
                                : null,
          likes_source:       'scraped',
          comments_source:    'scraped',
          shares_source:      'scraped',
          saves_source:       'scraped',
          views_source:       'scraped',
          impressions_source: 'manual',
          reach_source:       'manual',
          clicks_source:      'manual',
          data_source:        'scraped',
        });

        insertedCount++;
      } catch (postErr) {
        console.error(`Brand scrape: failed to process post ${post.postUrl}:`, postErr);
      }
    }

    await updateBrand(env.DB, brandId, {
      name:            data.name ?? handle,
      handle:          data.handle,
      followers:       data.followers,
      total_posts:     insertedCount,
      tagged_posts:    taggedCount,
      non_tagged_posts: insertedCount - taggedCount,
      last_scraped:    now,
      scrape_status:   'completed',
    });

    await invalidateReportCache(env.REPORT_CACHE);
    console.log(`Brand scrape completed: ${handle} — ${insertedCount} posts, ${taggedCount} tagged`);
  } catch (err) {
    console.error(`Brand scrape failed for ${handle}:`, err);
    await updateBrand(env.DB, brandId, { scrape_status: 'failed' });
  }
}

// ── OAuth token refresh (Twitter 2h, YouTube 1h) ──────────────────────────────

async function refreshExpiringTokens(env: Env): Promise<void> {
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const threshold = new Date(Date.now() + SEVEN_DAYS_MS).toISOString();

  const allAccounts = await env.DB
    .prepare(
      `SELECT * FROM connected_accounts
       WHERE refresh_token IS NOT NULL
         AND token_expiry IS NOT NULL
         AND token_expiry < ?`,
    )
    .bind(threshold)
    .all<import('./db/queries').ConnectedAccount>();

  for (const acct of allAccounts.results ?? []) {
    try {
      if (acct.platform === 'Twitter') {
        const { accessToken, refreshToken, expiresAt } = await refreshTwitterToken(acct.refresh_token!, env);
        await updateConnectedAccountTokens(env.DB, acct.id, accessToken, refreshToken, expiresAt);
        console.log(`Refreshed Twitter token for ${acct.username}`);
      } else if (acct.platform === 'YouTube') {
        const { accessToken, expiresAt } = await refreshYouTubeToken(acct.refresh_token!, env);
        await updateConnectedAccountTokens(env.DB, acct.id, accessToken, acct.refresh_token, expiresAt);
        console.log(`Refreshed YouTube token for ${acct.username}`);
      }
    } catch (err) {
      console.error(`Token refresh failed for ${acct.platform} account ${acct.username}:`, err);
    }
  }
}
