import type { Env } from '../../types/env';
import { getDatasetItems } from '../../services/scrapers/apify/client';
import { safeJsonParse } from '../../utils/json';
import { normalizeItems } from '../../services/scrapers/apify/normalizer';
import {
  getPostByUrl, getMetricsByPostId, upsertMetrics, insertSnapshot, updatePost, getPostById
} from '../../db/queries';
import { buildMetricsFromScrape } from '../../services/metrics';
import { calculateNextScrape } from '../../services/scheduler';
import { invalidateReportCache } from '../../services/cache';
import { generateId } from '../../utils/id';
import type { ScrapeEvent } from '../../durable-objects/scrape-status';
import { normalizeUrl } from '../../utils/urlProcessor';
import { applyInstagramOwnerData } from '../routers/scrape';

interface ApifyWebhookBody {
  eventType: string;
  actorRunId: string;
  actorId: string;
  defaultDatasetId: string;
  status: string;
  // Custom fields we embed in the webhook requestUrl as query params
}

/**
 * Handles POST /api/webhooks/apify?platform=Instagram&postIds=id1,id2,...&secret=<WEBHOOK_SECRET>
 */
export async function handleApifyWebhook(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  // Verify shared secret embedded in the webhook URL
  const secret = url.searchParams.get('secret');
  if (!secret || secret !== env.WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const platform = url.searchParams.get('platform');
  const postIdsParam = url.searchParams.get('postIds');

  if (!platform || !postIdsParam) {
    return new Response('Missing platform or postIds params', { status: 400 });
  }

  const postIds = postIdsParam.split(',').filter(Boolean);

  let body: ApifyWebhookBody;
  try {
    body = await request.json<ApifyWebhookBody>();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  // Broadcast "scraping completed/failed" via Durable Object
  const doId = env.SCRAPE_STATUS.idFromName('global');
  const doStub = env.SCRAPE_STATUS.get(doId) as unknown as { broadcast(e: ScrapeEvent): void };

  if (body.eventType === 'ACTOR.RUN.FAILED' || body.status === 'FAILED') {
    // Mark posts as failed
    await Promise.all(
      postIds.map(id =>
        updatePost(env.DB, id, {
          scrape_status: 'failed',
          last_error: `Apify run ${body.actorRunId} failed`,
          fail_count: undefined, // incremented below
        })
      )
    );

    // Increment fail_count and auto-lock after 5 failures
    for (const id of postIds) {
      const post = await getPostById(env.DB, id);
      if (!post) continue;
      const newCount = post.fail_count + 1;
      await updatePost(env.DB, id, {
        fail_count: newCount,
        lock: newCount >= 5 ? 1 : post.lock,
        scrape_status: newCount >= 5 ? 'post_deleted' : 'failed',
      });
    }

    doStub.broadcast({ type: 'failed', postIds, timestamp: new Date().toISOString() });
    return new Response('OK', { status: 200 });
  }

  // SUCCESS — fetch dataset items
  const items = await getDatasetItems<Record<string, unknown>>(body.defaultDatasetId, env.APIFY_TOKEN);
  const normalized = normalizeItems(platform, items);

  // Fetch connected IG account handle (needed for post type detection)
  const igRaw = platform === 'Instagram' ? await env.REPORT_CACHE.get('settings:ig_connection') : null;
  const igCreds = safeJsonParse<{ handle: string; password: string } | null>(igRaw, null);

  // Match normalized results to posts by URL
  const updatedPostIds: string[] = [];

  for (const norm of normalized) {
    const normUrl = normalizeUrl(norm.url);
    const post = await getPostByUrl(env.DB, normUrl);
    if (!post) continue;

    const existingMetrics = await getMetricsByPostId(env.DB, post.id);
    const newMetrics = buildMetricsFromScrape(post.id, norm, existingMetrics);

    await upsertMetrics(env.DB, newMetrics);
    await insertSnapshot(env.DB, {
      id: generateId(),
      post_id: post.id,
      scraped_at: newMetrics.scraped_at!,
      likes: newMetrics.likes,
      comments: newMetrics.comments,
      shares: newMetrics.shares,
      saves: newMetrics.saves,
      views: newMetrics.views,
      impressions: newMetrics.impressions,
      reach: newMetrics.reach,
      clicks: newMetrics.clicks,
    });

    const nextScrape = calculateNextScrape(post, newMetrics, existingMetrics ?? undefined);
    await updatePost(env.DB, post.id, {
      scrape_status: 'success',
      last_error: null,
      fail_count: 0,
      next_scrape_at: nextScrape,
    });

    // Apply Instagram owner data (post type + uploader handle + queue profile scrape)
    // Wrapped in try/catch so queue errors don't bubble up and corrupt the success status
    if (platform === 'Instagram') {
      try { await applyInstagramOwnerData(post.id, norm, igCreds?.handle ?? null, env); } catch (e) { console.error('applyInstagramOwnerData failed:', e); }
    }

    updatedPostIds.push(post.id);
  }

  // Mark any un-matched postIds as failed
  const unmatched = postIds.filter(id => !updatedPostIds.includes(id));
  for (const id of unmatched) {
    const post = await getPostById(env.DB, id);
    if (!post) continue;
    const newCount = post.fail_count + 1;
    await updatePost(env.DB, id, {
      scrape_status: 'failed',
      last_error: 'URL not found in Apify results',
      fail_count: newCount,
      lock: newCount >= 5 ? 1 : post.lock,
    });
  }

  // Invalidate KV report cache
  try { await invalidateReportCache(env.REPORT_CACHE); } catch (e) { console.error('invalidateReportCache failed:', e); }

  // Broadcast completion
  doStub.broadcast({
    type: 'completed',
    postIds: updatedPostIds,
    data: { platform },
    timestamp: new Date().toISOString(),
  });

  return new Response('OK', { status: 200 });
}
