'use client';

import { useState, type RefObject } from 'react';
import { Presentation, FileDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import pptxgen from 'pptxgenjs';
import { ACCOUNT_COLORS } from './HandleInput';
import { svgToPng } from '../../utils/svgToPng';

// ─── Types matching competitor router output ──────────────────────────────────

interface PostResult {
  post_url: string | null;
  post_type: string | null;
  published_at: string | null;
  likes: number;
  comments: number;
  views: number | null;
  engagement: number;
  engagement_rate: number | null;
  content_bucket: string | null;
  sub_bucket: string | null;
  tags: string | null;
}

interface RunResult {
  account: { label: string; handle: string; is_self: number };
  accountRun: {
    followers: number | null;
    avg_likes: number | null;
    avg_comments: number | null;
    avg_views: number | null;
    avg_engagement: number | null;
    avg_engagement_rate: number | null;
    status: string;
  };
  posts: PostResult[];
}

interface RunData {
  run: { id: string; set_id: string; status: string; triggered_at: string; completed_at: string | null };
  results: RunResult[];
}

interface Props {
  resultsData: RunData | undefined;
  activeSetId: string | null;
  setName: string;
  refFollowers:  RefObject<HTMLDivElement>;
  refEngRate:    RefObject<HTMLDivElement>;
  refEngagement: RefObject<HTMLDivElement>;
  refLikes:      RefObject<HTMLDivElement>;
  refComments:   RefObject<HTMLDivElement>;
  refViews:      RefObject<HTMLDivElement>;
  refTrend:      RefObject<HTMLDivElement>;
  trendMetric: 'engagement' | 'engagement_rate' | 'likes' | 'views';
}

// ─── Display helpers ──────────────────────────────────────────────────────────

function displayHandle(handle: string): string {
  const h = handle.trim();
  if (h.toLowerCase().includes('linkedin.com/')) {
    const parts = h.replace(/^https?:\/\//i, '').split('/').filter(Boolean);
    return parts[parts.length - 1] ?? h;
  }
  return `@${h}`;
}

// ─── Number formatters ────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—';
  return (n * 100).toFixed(2) + '%';
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Theme ────────────────────────────────────────────────────────────────────

const T = {
  BG:      'FFFFFF',
  ACCENT:  '6366f1',
  LIGHT:   'EEF2FF',
  TITLE:   '111827',
  BODY:    '374151',
  MUTED:   '9CA3AF',
  BORDER:  'E5E7EB',
  ROW_ALT: 'F9FAFB',
};

// ─── Insight generators ───────────────────────────────────────────────────────

function insightFollowers(accounts: RunResult[]): string {
  const valid = accounts.filter(a => a.accountRun.followers != null);
  if (valid.length === 0) return 'No follower data available.';
  const sorted = [...valid].sort((a, b) => (b.accountRun.followers ?? 0) - (a.accountRun.followers ?? 0));
  const top = sorted[0]!;
  const bottom = sorted[sorted.length - 1]!;
  if (sorted.length === 1) return `${top.account.label} has ${fmt(top.accountRun.followers)} followers.`;
  const ratio = ((top.accountRun.followers ?? 0) / Math.max(bottom.accountRun.followers ?? 1, 1)).toFixed(1);
  return `${top.account.label} leads with ${fmt(top.accountRun.followers)} followers — ${ratio}× more than ${bottom.account.label} (${fmt(bottom.accountRun.followers)}).`;
}

function insightEngRate(accounts: RunResult[]): string {
  const valid = accounts.filter(a => a.accountRun.avg_engagement_rate != null);
  if (valid.length === 0) return 'No engagement rate data available.';
  const sorted = [...valid].sort((a, b) => (b.accountRun.avg_engagement_rate ?? 0) - (a.accountRun.avg_engagement_rate ?? 0));
  const top = sorted[0]!;
  const self = accounts.find(a => a.account.is_self);
  let text = `${top.account.label} has the highest avg. engagement rate at ${fmtPct(top.accountRun.avg_engagement_rate)}.`;
  if (self && self.account.label !== top.account.label) {
    text += ` Your account (${self.account.label}) is at ${fmtPct(self.accountRun.avg_engagement_rate)}.`;
  }
  return text;
}

function insightLikes(accounts: RunResult[]): string {
  const valid = accounts.filter(a => a.accountRun.avg_likes != null);
  if (valid.length === 0) return 'No likes data available.';
  const sorted = [...valid].sort((a, b) => (b.accountRun.avg_likes ?? 0) - (a.accountRun.avg_likes ?? 0));
  const top = sorted[0]!;
  const avg = valid.reduce((s, a) => s + (a.accountRun.avg_likes ?? 0), 0) / valid.length;
  const pctAbove = avg > 0 ? (((top.accountRun.avg_likes ?? 0) / avg - 1) * 100).toFixed(0) : '0';
  if (valid.length === 1) return `${top.account.label} averages ${fmt(top.accountRun.avg_likes)} likes per post.`;
  return `${top.account.label} averages the most likes at ${fmt(top.accountRun.avg_likes)} per post — ${pctAbove}% above the group average of ${fmt(Math.round(avg))}.`;
}

function insightViews(accounts: RunResult[]): string {
  const valid = accounts.filter(a => a.accountRun.avg_views != null && a.accountRun.avg_views > 0);
  const nullCount = accounts.length - valid.length;
  if (valid.length === 0) return 'No views data available (accounts may not post Reels/Videos).';
  const sorted = [...valid].sort((a, b) => (b.accountRun.avg_views ?? 0) - (a.accountRun.avg_views ?? 0));
  const top = sorted[0]!;
  let text = `${top.account.label} leads with ${fmt(top.accountRun.avg_views)} avg. views per post.`;
  if (nullCount > 0) text += ` ${nullCount} account(s) have no views data (likely non-Reel content).`;
  return text;
}

function insightTrend(
  accounts: RunResult[],
  trendMetric: 'engagement' | 'engagement_rate' | 'likes' | 'views',
): string {
  const metricLabel: Record<string, string> = {
    engagement: 'Engagement', engagement_rate: 'Engagement Rate', likes: 'Likes', views: 'Views',
  };
  const label = metricLabel[trendMetric] ?? trendMetric;

  const getVal = (p: PostResult) => {
    if (trendMetric === 'engagement') return p.engagement;
    if (trendMetric === 'engagement_rate') return p.engagement_rate ?? 0;
    if (trendMetric === 'likes') return p.likes;
    if (trendMetric === 'views') return p.views ?? 0;
    return 0;
  };

  const improvements = accounts
    .filter(a => a.posts.length >= 2)
    .map(a => {
      const posts = [...a.posts].sort((x, y) =>
        new Date(x.published_at ?? 0).getTime() - new Date(y.published_at ?? 0).getTime()
      );
      const first = getVal(posts[0]!);
      const last  = getVal(posts[posts.length - 1]!);
      return { label: a.account.label, delta: last - first, first, last };
    });

  if (improvements.length === 0) return `Showing ${label} trend across last 30 posts.`;

  const best = improvements.sort((a, b) => b.delta - a.delta)[0]!;
  const direction = best.delta >= 0 ? 'improved' : 'declined';
  const change = Math.abs(best.delta);
  return `Showing ${label} trend. ${best.label} ${direction} the most (${trendMetric === 'engagement_rate' ? fmtPct(change) : fmt(Math.round(change))} change from first to latest post).`;
}

// ─── Refs type (shared by both generators) ───────────────────────────────────

interface ChartRefs {
  followers:  RefObject<HTMLDivElement>;
  engRate:    RefObject<HTMLDivElement>;
  engagement: RefObject<HTMLDivElement>;
  likes:      RefObject<HTMLDivElement>;
  comments:   RefObject<HTMLDivElement>;
  views:      RefObject<HTMLDivElement>;
  trend:      RefObject<HTMLDivElement>;
}

// ─── HTML Presentation generator ─────────────────────────────────────────────

async function generateHtmlPpt(
  data: RunData,
  setName: string,
  refs: ChartRefs,
  trendMetric: 'engagement' | 'engagement_rate' | 'likes' | 'views',
): Promise<string> {
  const accounts = data.results.filter(r => r.account != null);
  const runDate  = fmtDate(data.run.triggered_at);

  const [pngFollowers, pngEngRate, pngEngagement, pngLikes, pngComments, pngViews, pngTrend] = await Promise.all([
    refs.followers.current  ? svgToPng(refs.followers.current)  : Promise.resolve(null),
    refs.engRate.current    ? svgToPng(refs.engRate.current)    : Promise.resolve(null),
    refs.engagement.current ? svgToPng(refs.engagement.current) : Promise.resolve(null),
    refs.likes.current      ? svgToPng(refs.likes.current)      : Promise.resolve(null),
    refs.comments.current   ? svgToPng(refs.comments.current)   : Promise.resolve(null),
    refs.views.current      ? svgToPng(refs.views.current)      : Promise.resolve(null),
    refs.trend.current      ? svgToPng(refs.trend.current)      : Promise.resolve(null),
  ]);

  const slides: string[] = [];

  // ── Slide 1: Cover ────────────────────────────────────────────────────
  const accountPills = accounts.map((r, i) => {
    const color = ACCOUNT_COLORS[i % ACCOUNT_COLORS.length];
    return `<span style="display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);border-radius:999px;padding:5px 14px;font-size:12px;color:#fff;">
      <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></span>
      <strong>${r.account.label}</strong>&nbsp;<span style="opacity:0.7;">${displayHandle(r.account.handle)}</span>
    </span>`;
  }).join('');

  slides.push(`
    <div class="slide cover">
      <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 60%,#6366f1 100%);"></div>
      <div style="position:absolute;top:-80px;right:-80px;width:340px;height:340px;border-radius:50%;background:rgba(255,255,255,0.06);"></div>
      <div style="position:absolute;bottom:-60px;left:-60px;width:240px;height:240px;border-radius:50%;background:rgba(255,255,255,0.04);"></div>
      <div style="position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;gap:0;">
        <div style="font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#a5b4fc;margin-bottom:18px;">Competitor Analysis Report</div>
        <h1 style="font-size:52px;font-weight:800;color:#fff;line-height:1.1;margin-bottom:20px;">${setName}</h1>
        <div style="width:48px;height:3px;background:#a5b4fc;border-radius:999px;margin-bottom:24px;"></div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:700px;margin-bottom:28px;">${accountPills}</div>
        <div style="font-size:12px;color:#c7d2fe;">Run date: ${runDate}</div>
      </div>
    </div>`);

  // ── Slide 2: KPI Overview ─────────────────────────────────────────────
  const kpiRows = accounts.map((r, i) => {
    const color = ACCOUNT_COLORS[i % ACCOUNT_COLORS.length];
    return `<tr>
      <td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:6px;"></span><strong>${r.account.label}</strong> <span style="color:#9ca3af;font-size:11px;">${displayHandle(r.account.handle)}</span></td>
      <td>${fmt(r.accountRun.followers)}</td>
      <td>${fmtPct(r.accountRun.avg_engagement_rate)}</td>
      <td>${fmt(r.accountRun.avg_engagement)}</td>
      <td>${fmt(r.accountRun.avg_views)}</td>
      <td>${fmt(r.accountRun.avg_likes)}</td>
      <td>${fmt(r.accountRun.avg_comments)}</td>
    </tr>`;
  }).join('');

  slides.push(`
    <div class="slide">
      <div class="accent-bar"></div>
      <div class="slide-title">KPI Overview</div>
      <div style="flex:1;overflow:auto;">
        <table>
          <thead><tr>
            <th style="text-align:left;">Account</th>
            <th>Followers</th><th>Avg. Eng. Rate</th><th>Avg. Engagement</th>
            <th>Avg. Views</th><th>Avg. Likes</th><th>Avg. Comments</th>
          </tr></thead>
          <tbody>${kpiRows}</tbody>
        </table>
      </div>
    </div>`);

  // ── Helper: chart slide ───────────────────────────────────────────────
  function chartSlide(title: string, subtitle: string, png: string | null, insight: string): string {
    const img = png
      ? `<img src="${png}" style="flex:1;min-height:0;width:100%;object-fit:contain;">`
      : `<div style="flex:1;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:16px;">No data available</div>`;
    return `
    <div class="slide">
      <div class="accent-bar"></div>
      <div class="slide-title">${title}</div>
      <div class="slide-sub">${subtitle}</div>
      ${img}
      <div class="insight"><strong>Insight:</strong> ${insight}</div>
    </div>`;
  }

  // ── Slides 3–9: Chart slides ──────────────────────────────────────────
  slides.push(chartSlide('Avg. Engagement per Post', 'Average engagement (likes + comments) per post', pngEngagement, insightEngRate(accounts)));
  slides.push(chartSlide('Avg. Likes per Post', 'Average likes per post across scraped posts', pngLikes, insightLikes(accounts)));
  slides.push(chartSlide('Avg. Comments per Post', 'Average comments per post across scraped posts', pngComments, insightEngRate(accounts)));
  slides.push(chartSlide('Avg. Views per Post', 'Average views per post (Reels / Videos)', pngViews, insightViews(accounts)));
  slides.push(chartSlide('Followers', 'Total follower count per account', pngFollowers, insightFollowers(accounts)));
  slides.push(chartSlide('Avg. Engagement Rate', 'Average engagement rate per post across scraped posts', pngEngRate, insightEngRate(accounts)));

  const trendLabel: Record<string, string> = { engagement: 'Engagement', engagement_rate: 'Engagement Rate', likes: 'Likes', views: 'Views' };
  slides.push(chartSlide(
    `Engagement Trend — ${trendLabel[trendMetric] ?? trendMetric}`,
    'Metric plotted across last 30 posts by post index (oldest → newest)',
    pngTrend,
    insightTrend(accounts, trendMetric),
  ));

  // ── Slides 10+: Per-account post tables ──────────────────────────────
  for (let i = 0; i < accounts.length; i++) {
    const r = accounts[i]!;
    const color = ACCOUNT_COLORS[i % ACCOUNT_COLORS.length];
    const posts = r.posts;
    const postRows = posts.length === 0
      ? `<tr><td colspan="11" style="text-align:center;color:#9ca3af;padding:24px;">No posts available.</td></tr>`
      : posts.map(p => `<tr>
          <td style="text-align:left;">${fmtDate(p.published_at)}</td>
          <td style="text-align:left;">${p.post_type ?? '—'}</td>
          <td>${fmt(p.likes)}</td>
          <td>${fmt(p.comments)}</td>
          <td>${fmt(p.views)}</td>
          <td>${fmt(p.engagement)}</td>
          <td>${fmtPct(p.engagement_rate)}</td>
          <td style="text-align:left;">${p.content_bucket ?? '—'}</td>
          <td style="text-align:left;">${p.sub_bucket ?? '—'}</td>
          <td style="text-align:left;">${p.tags ?? '—'}</td>
          <td style="text-align:left;">${p.post_url ? `<a href="${p.post_url}" target="_blank" style="color:#6366f1;text-decoration:none;font-weight:500;">Link ↗</a>` : '—'}</td>
        </tr>`).join('');

    slides.push(`
    <div class="slide">
      <div class="accent-bar" style="background:${color};"></div>
      <div style="font-size:22px;font-weight:700;color:${color};margin-bottom:4px;">${r.account.label} <span style="color:#9ca3af;font-weight:400;font-size:16px;">${displayHandle(r.account.handle)}</span></div>
      <div style="font-size:12px;color:#9ca3af;margin-bottom:16px;">Followers: ${fmt(r.accountRun.followers)} &nbsp;•&nbsp; Avg. Eng. Rate: ${fmtPct(r.accountRun.avg_engagement_rate)} &nbsp;•&nbsp; Avg. Engagement: ${fmt(r.accountRun.avg_engagement)}</div>
      <div style="flex:1;overflow:auto;">
        <table>
          <thead><tr>
            <th style="text-align:left;">Date</th><th style="text-align:left;">Type</th>
            <th>Likes</th><th>Comments</th><th>Views</th><th>Engagement</th><th>Eng. Rate</th>
            <th style="text-align:left;">Bucket</th><th style="text-align:left;">Sub-bucket</th><th style="text-align:left;">Tags</th>
            <th style="text-align:left;">Post</th>
          </tr></thead>
          <tbody>${postRows}</tbody>
        </table>
      </div>
    </div>`);
  }

  // ── Last slide: End ───────────────────────────────────────────────────
  slides.push(`
    <div class="slide cover">
      <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 60%,#6366f1 100%);"></div>
      <div style="position:absolute;top:-80px;right:-80px;width:340px;height:340px;border-radius:50%;background:rgba(255,255,255,0.06);"></div>
      <div style="position:absolute;bottom:-60px;left:-60px;width:240px;height:240px;border-radius:50%;background:rgba(255,255,255,0.04);"></div>
      <div style="position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;">
        <h1 style="font-size:52px;font-weight:800;color:#fff;letter-spacing:-1px;margin-bottom:16px;">Thank You</h1>
        <div style="width:48px;height:3px;background:#a5b4fc;border-radius:999px;margin-bottom:20px;"></div>
        <p style="font-size:14px;color:#c7d2fe;">Report generated by <strong style="color:#fff;">Grapes Worldwide Report Agent</strong></p>
        <p style="font-size:12px;color:#a5b4fc;margin-top:8px;">${runDate}</p>
      </div>
    </div>`);

  // ── Assemble HTML ─────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${setName} — Competitor Analysis</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0f0f1a; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; overflow: hidden; }

    /* ── Slide base ── */
    .slide { display: none; width: 100vw; height: 100vh; background: #fff; position: relative; padding: 48px 64px 48px 80px; flex-direction: column; }
    .slide.active { display: flex; }

    /* ── Left accent stripe ── */
    .accent-bar { position: absolute; left: 0; top: 0; width: 6px; height: 100%; background: linear-gradient(180deg, #6366f1 0%, #818cf8 100%); border-radius: 0 3px 3px 0; }

    /* ── Slide header ── */
    .slide-title { font-size: 30px; font-weight: 800; color: #111827; margin-bottom: 4px; letter-spacing: -0.5px; }
    .slide-sub   { font-size: 13px; color: #9ca3af; margin-bottom: 20px; font-weight: 400; }

    /* ── Insight box ── */
    .insight {
      background: linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%);
      border-left: 4px solid #6366f1;
      border-radius: 0 8px 8px 0;
      padding: 12px 18px;
      font-size: 13px;
      color: #3730a3;
      margin-top: 14px;
      flex-shrink: 0;
      line-height: 1.6;
    }

    /* ── Tables ── */
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th    { background: #f8fafc; color: #6b7280; font-weight: 600; padding: 10px 14px; text-align: right; border-bottom: 2px solid #e5e7eb; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    td    { padding: 10px 14px; border-bottom: 1px solid #f1f5f9; text-align: right; color: #1f2937; }
    tr:nth-child(even) td { background: #fafafa; }
    tr:hover td { background: #f0f4ff; }

    /* ── Cover slide ── */
    .cover { overflow: hidden; padding: 0; }
    .cover h1 { font-size: 52px; font-weight: 800; color: #fff; letter-spacing: -1px; line-height: 1.1; }

    /* ── Nav bar ── */
    .nav        { position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 16px; background: rgba(0,0,0,0.75); backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.1); border-radius: 999px; padding: 9px 24px; z-index: 100; }
    .nav button { background: none; border: none; color: #fff; font-size: 20px; cursor: pointer; line-height: 1; padding: 0 4px; opacity: 0.8; transition: opacity .15s; }
    .nav button:hover { opacity: 1; color: #a5b4fc; }
    .nav span   { color: #e5e7eb; font-size: 13px; min-width: 64px; text-align: center; font-weight: 500; }
  </style>
</head>
<body>
${slides.join('\n')}
  <div class="nav">
    <button onclick="go(-1)" title="Previous (←)">&#8592;</button>
    <span id="ctr"></span>
    <button onclick="go(1)" title="Next (→)">&#8594;</button>
  </div>
  <script>
    var cur = 0;
    var slides = document.querySelectorAll('.slide');
    function show(n) {
      slides.forEach(function(s, i) { s.classList.toggle('active', i === n); });
      cur = n;
      document.getElementById('ctr').textContent = (n + 1) + ' / ' + slides.length;
    }
    function go(d) { show(Math.max(0, Math.min(cur + d, slides.length - 1))); }
    document.addEventListener('keydown', function(e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') go(1);
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   go(-1);
    });
    show(0);
  </script>
</body>
</html>`;
}

// ─── PowerPoint generator ─────────────────────────────────────────────────────

async function generatePptx(
  data: RunData,
  setName: string,
  refs: ChartRefs,
  trendMetric: 'engagement' | 'engagement_rate' | 'likes' | 'views',
): Promise<void> {
  const accounts = data.results.filter(r => r.account != null);
  const runDate  = fmtDate(data.run.triggered_at);

  // Capture chart PNGs in parallel
  const [pngFollowers, pngEngRate, pngEngagement, pngLikes, pngComments, pngViews, pngTrend] = await Promise.all([
    refs.followers.current  ? svgToPng(refs.followers.current)  : Promise.resolve(null),
    refs.engRate.current    ? svgToPng(refs.engRate.current)    : Promise.resolve(null),
    refs.engagement.current ? svgToPng(refs.engagement.current) : Promise.resolve(null),
    refs.likes.current      ? svgToPng(refs.likes.current)      : Promise.resolve(null),
    refs.comments.current   ? svgToPng(refs.comments.current)   : Promise.resolve(null),
    refs.views.current      ? svgToPng(refs.views.current)      : Promise.resolve(null),
    refs.trend.current      ? svgToPng(refs.trend.current)      : Promise.resolve(null),
  ]);

  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE'; // 13.33 × 7.5 inches
  pres.author = 'Grapes Worldwide Report Agent';
  pres.company = 'Grapes Worldwide';

  // ── Helper: add left accent stripe ───────────────────────────────────
  function addAccentBar(slide: pptxgen.Slide, color = T.ACCENT) {
    slide.addShape('rect', {
      x: 0, y: 0, w: 0.08, h: 7.5,
      fill: { color },
      line: { type: 'none' },
    });
  }

  // ── Slide 1: Cover ────────────────────────────────────────────────────
  {
    const slide = pres.addSlide();
    slide.background = { color: '4f46e5' };
    slide.addText('COMPETITOR ANALYSIS REPORT', {
      x: 0.5, y: 1.0, w: 12.3, h: 0.5,
      fontSize: 11, bold: true, color: 'a5b4fc',
      align: 'center', charSpacing: 4,
    });
    slide.addText(setName, {
      x: 0.5, y: 1.6, w: 12.3, h: 1.8,
      fontSize: 44, bold: true, color: 'FFFFFF',
      align: 'center',
    });
    // Accent divider line
    slide.addShape('rect', {
      x: 6.17, y: 3.5, w: 1.0, h: 0.05,
      fill: { color: 'a5b4fc' },
      line: { type: 'none' },
    });
    // Account names
    const accountList = accounts.map(r => r.account.label).join('  •  ');
    slide.addText(accountList, {
      x: 0.5, y: 3.7, w: 12.3, h: 0.6,
      fontSize: 12, color: 'c7d2fe', align: 'center',
    });
    slide.addText(`Run date: ${runDate}`, {
      x: 0.5, y: 6.8, w: 12.3, h: 0.4,
      fontSize: 11, color: 'a5b4fc', align: 'center',
    });
  }

  // ── Slide 2: KPI Overview ─────────────────────────────────────────────
  {
    const slide = pres.addSlide();
    slide.background = { color: T.BG };
    addAccentBar(slide);
    slide.addText('KPI Overview', {
      x: 0.35, y: 0.25, w: 12.6, h: 0.7,
      fontSize: 26, bold: true, color: T.TITLE,
    });

    const hOpts = { bold: true, color: 'FFFFFF', fill: { color: T.ACCENT } };
    const headerRow = [
      { text: 'Account',         options: { ...hOpts, align: 'left'  as const } },
      { text: 'Followers',       options: { ...hOpts, align: 'right' as const } },
      { text: 'Avg. Eng. Rate',  options: { ...hOpts, align: 'right' as const } },
      { text: 'Avg. Engagement', options: { ...hOpts, align: 'right' as const } },
      { text: 'Avg. Views',      options: { ...hOpts, align: 'right' as const } },
      { text: 'Avg. Likes',      options: { ...hOpts, align: 'right' as const } },
      { text: 'Avg. Comments',   options: { ...hOpts, align: 'right' as const } },
    ];

    const dataRows = accounts.map((r, idx) => {
      const fill = { color: idx % 2 === 0 ? T.BG : T.ROW_ALT };
      const dOpts = { fill, color: T.BODY };
      return [
        { text: `${r.account.label}  ${displayHandle(r.account.handle)}`, options: { ...dOpts, align: 'left'  as const } },
        { text: fmt(r.accountRun.followers),           options: { ...dOpts, align: 'right' as const } },
        { text: fmtPct(r.accountRun.avg_engagement_rate), options: { ...dOpts, align: 'right' as const } },
        { text: fmt(r.accountRun.avg_engagement),      options: { ...dOpts, align: 'right' as const } },
        { text: fmt(r.accountRun.avg_views),           options: { ...dOpts, align: 'right' as const } },
        { text: fmt(r.accountRun.avg_likes),           options: { ...dOpts, align: 'right' as const } },
        { text: fmt(r.accountRun.avg_comments),        options: { ...dOpts, align: 'right' as const } },
      ];
    });

    slide.addTable([headerRow, ...dataRows], {
      x: 0.35, y: 1.1, w: 12.6,
      colW: [3.0, 1.5, 1.8, 2.0, 1.5, 1.5, 1.3],
      border: { type: 'solid', pt: 1, color: T.BORDER },
      fontSize: 11,
    });
  }

  // ── Helper: add chart slide ───────────────────────────────────────────
  function addChartSlide(title: string, subtitle: string, png: string | null, insight: string) {
    const slide = pres.addSlide();
    slide.background = { color: T.BG };
    addAccentBar(slide);
    slide.addText(title, {
      x: 0.35, y: 0.25, w: 12.6, h: 0.65,
      fontSize: 26, bold: true, color: T.TITLE,
    });
    slide.addText(subtitle, {
      x: 0.35, y: 0.9, w: 12.6, h: 0.35,
      fontSize: 12, color: T.MUTED,
    });
    if (png) {
      slide.addImage({ data: png, x: 0.35, y: 1.35, w: 12.6, h: 4.1 });
    } else {
      slide.addText('No data available', {
        x: 0.35, y: 1.35, w: 12.6, h: 4.1,
        fontSize: 16, color: T.MUTED, align: 'center', valign: 'middle',
      });
    }
    // Insight box background
    slide.addShape('rect', {
      x: 0.35, y: 5.6, w: 12.6, h: 1.55,
      fill: { color: T.LIGHT },
      line: { type: 'solid', color: T.ACCENT, pt: 2 },
    });
    slide.addText([
      { text: 'Insight: ', options: { bold: true } },
      { text: insight },
    ], {
      x: 0.55, y: 5.7, w: 12.2, h: 1.35,
      fontSize: 11, color: '3730a3',
    });
  }

  // ── Slides 3–9: Chart slides ──────────────────────────────────────────
  const trendLabel: Record<string, string> = { engagement: 'Engagement', engagement_rate: 'Engagement Rate', likes: 'Likes', views: 'Views' };
  addChartSlide('Avg. Engagement per Post',   'Average engagement (likes + comments) per post',            pngEngagement, insightEngRate(accounts));
  addChartSlide('Avg. Likes per Post',        'Average likes per post across scraped posts',               pngLikes,      insightLikes(accounts));
  addChartSlide('Avg. Comments per Post',     'Average comments per post across scraped posts',            pngComments,   insightEngRate(accounts));
  addChartSlide('Avg. Views per Post',        'Average views per post (Reels / Videos)',                   pngViews,      insightViews(accounts));
  addChartSlide('Followers',                  'Total follower count per account',                          pngFollowers,  insightFollowers(accounts));
  addChartSlide('Avg. Engagement Rate',       'Average engagement rate per post across scraped posts',     pngEngRate,    insightEngRate(accounts));
  addChartSlide(
    `Engagement Trend — ${trendLabel[trendMetric] ?? trendMetric}`,
    'Metric plotted across last 30 posts by post index (oldest → newest)',
    pngTrend,
    insightTrend(accounts, trendMetric),
  );

  // ── Slides 10+: Per-account post tables ──────────────────────────────
  for (let i = 0; i < accounts.length; i++) {
    const r = accounts[i]!;
    const rawColor = ACCOUNT_COLORS[i % ACCOUNT_COLORS.length] ?? '#6366f1';
    const acctColor = rawColor.replace('#', '');
    const slide = pres.addSlide();
    slide.background = { color: T.BG };
    addAccentBar(slide, acctColor);

    slide.addText(r.account.label, {
      x: 0.35, y: 0.2, w: 9, h: 0.55,
      fontSize: 22, bold: true, color: acctColor,
    });
    slide.addText(displayHandle(r.account.handle), {
      x: 0.35, y: 0.72, w: 12.6, h: 0.35,
      fontSize: 11, color: T.MUTED,
    });
    slide.addText(
      `Followers: ${fmt(r.accountRun.followers)}   ·   Avg. Eng. Rate: ${fmtPct(r.accountRun.avg_engagement_rate)}   ·   Avg. Engagement: ${fmt(r.accountRun.avg_engagement)}`,
      { x: 0.35, y: 1.0, w: 12.6, h: 0.3, fontSize: 10, color: T.MUTED },
    );

    const pH = { bold: true, color: 'FFFFFF', fill: { color: T.ACCENT } };
    const postHeaderRow = [
      { text: 'Date',        options: { ...pH, align: 'left'  as const } },
      { text: 'Type',        options: { ...pH, align: 'left'  as const } },
      { text: 'Likes',       options: { ...pH, align: 'right' as const } },
      { text: 'Comments',    options: { ...pH, align: 'right' as const } },
      { text: 'Views',       options: { ...pH, align: 'right' as const } },
      { text: 'Engagement',  options: { ...pH, align: 'right' as const } },
      { text: 'Eng. Rate',   options: { ...pH, align: 'right' as const } },
      { text: 'Bucket',      options: { ...pH, align: 'left'  as const } },
      { text: 'Sub-bucket',  options: { ...pH, align: 'left'  as const } },
      { text: 'Tags',        options: { ...pH, align: 'left'  as const } },
    ];

    const postDataRows = r.posts.length === 0
      ? [[{ text: 'No posts available', options: { colspan: 10, align: 'center' as const, color: T.MUTED, fill: { color: T.BG } } }]]
      : r.posts.map((p, j) => {
          const fill = { color: j % 2 === 0 ? T.BG : T.ROW_ALT };
          const dP = { fill, color: T.BODY };
          return [
            { text: fmtDate(p.published_at),    options: { ...dP, align: 'left'  as const } },
            { text: p.post_type ?? '—',          options: { ...dP, align: 'left'  as const } },
            { text: fmt(p.likes),                options: { ...dP, align: 'right' as const } },
            { text: fmt(p.comments),             options: { ...dP, align: 'right' as const } },
            { text: fmt(p.views),                options: { ...dP, align: 'right' as const } },
            { text: fmt(p.engagement),           options: { ...dP, align: 'right' as const } },
            { text: fmtPct(p.engagement_rate),   options: { ...dP, align: 'right' as const } },
            { text: p.content_bucket ?? '—',     options: { ...dP, align: 'left'  as const } },
            { text: p.sub_bucket ?? '—',         options: { ...dP, align: 'left'  as const } },
            { text: p.tags ?? '—',               options: { ...dP, align: 'left'  as const } },
          ];
        });

    slide.addTable([postHeaderRow, ...postDataRows], {
      x: 0.35, y: 1.4, w: 12.6,
      colW: [1.3, 0.8, 1.0, 1.1, 0.9, 1.2, 1.0, 1.8, 1.8, 1.7],
      border: { type: 'solid', pt: 1, color: T.BORDER },
      fontSize: 9,
      rowH: 0.22,
    });
  }

  // ── Last slide: Thank You ─────────────────────────────────────────────
  {
    const slide = pres.addSlide();
    slide.background = { color: '4f46e5' };
    slide.addText('Thank You', {
      x: 0.5, y: 2.4, w: 12.3, h: 1.5,
      fontSize: 48, bold: true, color: 'FFFFFF', align: 'center',
    });
    slide.addShape('rect', {
      x: 6.17, y: 4.1, w: 1.0, h: 0.05,
      fill: { color: 'a5b4fc' },
      line: { type: 'none' },
    });
    slide.addText('Report generated by Grapes Worldwide Report Agent', {
      x: 0.5, y: 4.3, w: 12.3, h: 0.5,
      fontSize: 13, color: 'c7d2fe', align: 'center',
    });
    slide.addText(runDate, {
      x: 0.5, y: 4.9, w: 12.3, h: 0.4,
      fontSize: 11, color: 'a5b4fc', align: 'center',
    });
  }

  const fileName = `${setName.replace(/\s+/g, '-')}-competitor-${new Date().toISOString().slice(0, 10)}.pptx`;
  await pres.writeFile({ fileName });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ExportPPTButton({
  resultsData, activeSetId: _activeSetId, setName,
  refFollowers, refEngRate, refEngagement, refLikes, refComments, refViews, refTrend,
  trendMetric,
}: Props) {
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState<'pptx' | 'html' | null>(null);

  const disabled = !resultsData || resultsData.run.status !== 'completed' || resultsData.results.length === 0;

  const chartRefs: ChartRefs = {
    followers:  refFollowers,
    engRate:    refEngRate,
    engagement: refEngagement,
    likes:      refLikes,
    comments:   refComments,
    views:      refViews,
    trend:      refTrend,
  };

  async function handleMakePptx() {
    if (!resultsData) return;
    setLoading('pptx');
    try {
      await generatePptx(resultsData, setName, chartRefs, trendMetric);
      toast.success('PowerPoint downloaded');
      setOpen(false);
    } catch (err) {
      toast.error('Failed to generate PowerPoint');
      console.error(err);
    } finally {
      setLoading(null);
    }
  }

  async function handleMakeHtml() {
    if (!resultsData) return;
    setLoading('html');
    try {
      const html = await generateHtmlPpt(resultsData, setName, chartRefs, trendMetric);
      const blob = new Blob([html], { type: 'text/html' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${setName.replace(/\s+/g, '-')}-competitor-${new Date().toISOString().slice(0, 10)}.html`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('HTML presentation downloaded');
      setOpen(false);
    } catch (err) {
      toast.error('Failed to generate presentation');
      console.error(err);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:border-indigo-300 hover:text-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed print:hidden"
        title={disabled ? 'Run an analysis first to export' : 'Export as PowerPoint or HTML'}
      >
        <Presentation size={14} />
        Export
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          <div className="absolute right-0 top-full mt-1.5 z-50 w-60 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Export Options</p>
            </div>

            {/* Make PowerPoint */}
            <button
              onClick={handleMakePptx}
              disabled={loading !== null}
              className="w-full flex items-start gap-2.5 px-3 py-2.5 hover:bg-indigo-50 transition-colors text-left disabled:opacity-50"
            >
              {loading === 'pptx' ? (
                <Loader2 size={16} className="mt-0.5 text-indigo-500 animate-spin shrink-0" />
              ) : (
                <Presentation size={16} className="mt-0.5 text-indigo-500 shrink-0" />
              )}
              <div>
                <p className="text-sm font-medium text-gray-800">Make PowerPoint</p>
                <p className="text-xs text-gray-500">Download a real .pptx file</p>
              </div>
            </button>

            {/* Make HTML */}
            <button
              onClick={handleMakeHtml}
              disabled={loading !== null}
              className="w-full flex items-start gap-2.5 px-3 py-2.5 hover:bg-indigo-50 transition-colors text-left disabled:opacity-50 border-t border-gray-100"
            >
              {loading === 'html' ? (
                <Loader2 size={16} className="mt-0.5 text-teal-500 animate-spin shrink-0" />
              ) : (
                <FileDown size={16} className="mt-0.5 text-teal-500 shrink-0" />
              )}
              <div>
                <p className="text-sm font-medium text-gray-800">Make HTML</p>
                <p className="text-xs text-gray-500">Download a browser-viewable slideshow</p>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
