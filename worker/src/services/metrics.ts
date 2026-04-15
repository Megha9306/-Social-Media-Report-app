import type { PostMetrics } from '../db/queries';
import type { NormalizedMetrics } from './scrapers/interface';
import { generateId } from '../utils/id';

export function recalculateComputed(m: Partial<PostMetrics>): Partial<PostMetrics> {
  const likes     = m.likes     ?? 0;
  const comments  = m.comments  ?? 0;
  const shares    = m.shares    ?? 0;
  const saves     = m.saves     ?? 0;
  const views     = m.views     ?? 0;
  const reach     = m.reach     ?? null;
  const impressions = m.impressions ?? null;
  const clicks    = m.clicks    ?? null;

  const active_eng   = likes + comments + shares + saves;
  const passive_eng  = views;

  return {
    ...m,
    active_eng,
    passive_eng,
    ctr:              impressions ? (clicks ?? 0) / impressions : null,
    vtr:              impressions ? views / impressions : null,
    active_eng_rate:  reach ? active_eng / reach : null,
    passive_eng_rate: reach ? (active_eng + passive_eng) / reach : null,
  };
}

export function buildMetricsFromScrape(
  postId: string,
  normalized: NormalizedMetrics,
  existingMetrics: PostMetrics | null
): PostMetrics {
  const now = new Date().toISOString();
  const monthDate = now.slice(0, 7) + '-01';

  const base: PostMetrics = {
    id:               existingMetrics?.id ?? generateId(),
    post_id:          postId,
    scraped_at:       now,
    month_date:       monthDate,

    // Scraped fields
    likes:            normalized.likes   ?? existingMetrics?.likes   ?? 0,
    comments:         normalized.comments ?? existingMetrics?.comments ?? 0,
    shares:           normalized.shares  ?? existingMetrics?.shares  ?? 0,
    saves:            normalized.saves   ?? existingMetrics?.saves   ?? 0,
    views:            normalized.views   ?? existingMetrics?.views   ?? 0,
    others:           normalized.others  ?? existingMetrics?.others  ?? 0,

    // Preserve manual tier-2 values
    impressions:      existingMetrics?.impressions ?? null,
    reach:            existingMetrics?.reach       ?? null,
    clicks:           existingMetrics?.clicks      ?? null,

    // Source tracking
    likes_source:     'scraped',
    comments_source:  'scraped',
    shares_source:    'scraped',
    saves_source:     'scraped',
    views_source:     'scraped',
    impressions_source: existingMetrics?.impressions_source ?? 'manual',
    reach_source:     existingMetrics?.reach_source         ?? 'manual',
    clicks_source:    existingMetrics?.clicks_source        ?? 'manual',
    data_source:      'scraped',

    // Computed — filled below
    ctr: null, vtr: null, active_eng: null, active_eng_rate: null,
    passive_eng: null, passive_eng_rate: null,
  };

  return recalculateComputed(base) as PostMetrics;
}

export function buildMetricsFromManualEntry(
  existing: PostMetrics,
  manual: { impressions?: number; reach?: number; clicks?: number }
): PostMetrics {
  const updated: PostMetrics = {
    ...existing,
    impressions: manual.impressions ?? existing.impressions,
    reach:       manual.reach       ?? existing.reach,
    clicks:      manual.clicks      ?? existing.clicks,
    impressions_source: manual.impressions != null ? 'manual' : existing.impressions_source,
    reach_source:       manual.reach       != null ? 'manual' : existing.reach_source,
    clicks_source:      manual.clicks      != null ? 'manual' : existing.clicks_source,
  };

  return recalculateComputed(updated) as PostMetrics;
}
