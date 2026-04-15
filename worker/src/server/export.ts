import type { Env } from '../types/env';
import { listPostsWithMetrics } from '../db/queries';

const VALID_PLATFORMS = new Set(['Instagram', 'Facebook', 'Twitter', 'LinkedIn', 'YouTube']);
const VALID_FORMATS   = new Set(['Static', 'Carousel', 'Gif', 'Reel', 'Video Post', 'Story', 'Article']);

const CSV_HEADERS = [
  'Platform','Content Bucket','Campaign','Tags','Format','Post URL',
  'Month/Date','Impressions','Reach','Clicks','CTR','Views','VTR',
  'Likes','Comments','Shares','Saves','Others',
  'Active Eng','Active Eng Rate','Passive Eng','Passive Eng Rate',
  'Lock','Last Scraped','Data Source',
];

function esc(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function pct(n: number | null | undefined): string {
  if (n == null) return '';
  return (n * 100).toFixed(2) + '%';
}

export async function handleExportCsv(request: Request, env: Env): Promise<Response> {
  // Verify API key
  const apiKey = request.headers.get('x-api-key');
  if (!apiKey || apiKey !== env.API_KEY) {
    return new Response('Unauthorized', { status: 401 });
  }

  const url = new URL(request.url);

  // Validate enum params to prevent unexpected values reaching the DB
  const platform  = url.searchParams.get('platform')  ?? undefined;
  const format    = url.searchParams.get('format')    ?? undefined;
  const date_from = url.searchParams.get('date_from') ?? undefined;
  const date_to   = url.searchParams.get('date_to')   ?? undefined;

  if (platform && !VALID_PLATFORMS.has(platform)) {
    return new Response(`Invalid platform: ${platform}`, { status: 400 });
  }
  if (format && !VALID_FORMATS.has(format)) {
    return new Response(`Invalid format: ${format}`, { status: 400 });
  }

  const filters = {
    platform,
    format,
    content_bucket: url.searchParams.get('content_bucket') ?? undefined,
    campaign:       url.searchParams.get('campaign')       ?? undefined,
    date_from,
    date_to,
    limit: 5000,
  };

  const posts = await listPostsWithMetrics(env.DB, filters);

  const rows = posts.map(p => {
    const m = p.metrics;
    return [
      p.platform, p.content_bucket, p.campaign, p.tags, p.format, p.post_url,
      m?.month_date ?? '',
      m?.impressions, m?.reach, m?.clicks, pct(m?.ctr), m?.views, pct(m?.vtr),
      m?.likes, m?.comments, m?.shares, m?.saves, m?.others,
      m?.active_eng, pct(m?.active_eng_rate), m?.passive_eng, pct(m?.passive_eng_rate),
      p.lock === 1 ? 'Yes' : 'No', m?.scraped_at ?? '', m?.data_source ?? '',
    ].map(esc).join(',');
  });

  const csv = [CSV_HEADERS.join(','), ...rows].join('\n');
  const filename = `report-${Date.now()}.csv`;

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function handleExportDownload(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  if (!key) return new Response('Missing key', { status: 400 });

  const obj = await env.EXPORTS_BUCKET?.get(key);
  if (!obj) return new Response('Not found', { status: 404 });

  return new Response(obj.body, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${key.split('/').pop() ?? 'export.csv'}"`,
      'Access-Control-Allow-Origin': '*',
    },
  });
}
