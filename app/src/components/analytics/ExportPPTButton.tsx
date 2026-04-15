'use client';

import { useState } from 'react';
import { Presentation, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { svgToPng } from '../../utils/svgToPng';
import type { PostWithMetrics } from '../../types';

// ── Data types (mirrored from tRPC return shapes) ─────────────────────────────

interface MomRow {
  month: string;
  post_count: number;
  total_views: number;
  total_impressions: number;
  total_active_eng: number;
  avg_active_eng_rate: number | null;
  total_passive_eng: number;
  avg_passive_eng_rate: number | null;
}

interface SowRow {
  month: string;
  format: string;
  post_count: number;
}

interface BucketRow {
  content_bucket: string;
  total_views: number;
  avg_active_eng_rate: number | null;
  post_count: number;
}

interface BucketMomRow {
  month: string;
  content_bucket: string;
  total_views: number;
  avg_active_eng_rate: number | null;
}

interface AnalysisInsightsPayload {
  contentDelivered: string;
  impressionsEng: string;
  viewsMOM: string;
  passiveEng: string;
  activeEng: string;
  bucketViews: string;
  bucketAER: string;
  bucketViewsMOM: string;
  bucketAERMOM: string;
  topPosts: string;
  bottomPosts: string;
}

export interface ExportPPTButtonProps {
  // Data
  momData:         MomRow[];
  sowData:         SowRow[];
  bucketAnalysis:  BucketRow[];
  bucketMOM:       BucketMomRow[];
  uniqueBuckets:   string[];
  topPosts:        PostWithMetrics[];
  bottomPosts:     PostWithMetrics[];
  // Filters (for file name + cover slide)
  platform:        string;
  globalMonth:     string;
  // Chart container refs (9 charts — followers chart skipped, it has no data)
  refContentDelivered: React.RefObject<HTMLDivElement>;
  refImpressionsEng:   React.RefObject<HTMLDivElement>;
  refViewsMOM:         React.RefObject<HTMLDivElement>;
  refPassiveEng:       React.RefObject<HTMLDivElement>;
  refActiveEng:        React.RefObject<HTMLDivElement>;
  refBucketViews:      React.RefObject<HTMLDivElement>;
  refBucketAER:        React.RefObject<HTMLDivElement>;
  refViewsByBucket:    React.RefObject<HTMLDivElement>;
  refAERByBucket:      React.RefObject<HTMLDivElement>;
  insights?:           Partial<AnalysisInsightsPayload>;
}

// ── Formatters ────────────────────────────────────────────────────────────────

const fmtN = (v: number | null | undefined): string => {
  if (v == null) return '—';
  return v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M`
    : v >= 1_000 ? `${(v / 1_000).toFixed(1)}K`
    : `${v}`;
};

const fmtP = (v: number | null | undefined): string =>
  v == null ? '—' : `${(v * 100).toFixed(2)}%`;

const monthLbl = (m: string): string => {
  try {
    return new Date(m + '-02').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  } catch { return m; }
};

// ── Insight generators ────────────────────────────────────────────────────────

function insightContentDelivered(sow: SowRow[]): string {
  if (!sow.length) return 'No content delivery data available for this period.';
  const byFmt: Record<string, number> = {};
  for (const r of sow) byFmt[r.format] = (byFmt[r.format] ?? 0) + r.post_count;
  const sorted = Object.entries(byFmt).sort((a, b) => b[1] - a[1]);
  const [topFmt, topCnt] = sorted[0]!;
  const total = Object.values(byFmt).reduce((s, v) => s + v, 0);
  const share = Math.round((topCnt / total) * 100);
  return `${topFmt} is the dominant format with ${topCnt} posts (${share}% of ${total} total). Focus on maintaining this output while testing secondary formats.`;
}

function insightImpressionsEng(mom: MomRow[]): string {
  if (mom.length < 2) return 'Insufficient monthly data to determine impression trend.';
  const latest = mom[mom.length - 1]!;
  const prev   = mom[mom.length - 2]!;
  const impChg = ((latest.total_impressions - prev.total_impressions) / Math.max(prev.total_impressions, 1)) * 100;
  const rateDir = (latest.avg_active_eng_rate ?? 0) >= (prev.avg_active_eng_rate ?? 0) ? 'improved' : 'declined';
  const sign = impChg >= 0 ? '+' : '';
  const action = impChg >= 0 && (latest.avg_active_eng_rate ?? 0) >= (prev.avg_active_eng_rate ?? 0)
    ? 'Both metrics trending positively — strong content period.'
    : 'Monitor whether impressions growth is converting to engagement.';
  return `Impressions ${impChg >= 0 ? 'grew' : 'dropped'} by ${sign}${impChg.toFixed(0)}% in ${monthLbl(latest.month)} while engagement rate ${rateDir} to ${fmtP(latest.avg_active_eng_rate)}. ${action}`;
}

function insightViewsMOM(mom: MomRow[]): string {
  if (!mom.length) return 'No views data available for this period.';
  const peak = mom.reduce((a, b) => b.total_views > a.total_views ? b : a);
  const latest = mom[mom.length - 1]!;
  const avg = mom.reduce((s, r) => s + r.total_views, 0) / mom.length;
  return `Peak views of ${fmtN(peak.total_views)} were achieved in ${monthLbl(peak.month)}. Latest month (${monthLbl(latest.month)}) saw ${fmtN(latest.total_views)} views — ${latest.total_views >= avg ? 'above' : 'below'} the ${fmtN(Math.round(avg))} monthly average.`;
}

function insightPassiveEng(mom: MomRow[]): string {
  if (!mom.length) return 'No passive engagement data available.';
  const totalPassive = mom.reduce((s, r) => s + r.total_passive_eng, 0);
  const totalActive  = mom.reduce((s, r) => s + r.total_active_eng, 0);
  const ratio = totalActive > 0 ? (totalPassive / totalActive).toFixed(1) : '0';
  return `Passive engagement totals ${fmtN(totalPassive)} — ${ratio}× the active engagement volume. High passive engagement indicates content is being consumed but not directly interacted with.`;
}

function insightActiveEng(mom: MomRow[]): string {
  if (mom.length < 2) return 'Insufficient data to determine active engagement trend.';
  const rates = mom.map(r => r.avg_active_eng_rate).filter((v): v is number => v != null);
  if (!rates.length) return 'No engagement rate data available.';
  const max = Math.max(...rates);
  const min = Math.min(...rates);
  const avg = rates.reduce((s, v) => s + v, 0) / rates.length;
  const latest = mom[mom.length - 1]!;
  return `Active engagement rate ranges from ${fmtP(min)} to ${fmtP(max)} — a ${fmtP(max - min)} spread. Latest month sits at ${fmtP(latest.avg_active_eng_rate)}, ${(latest.avg_active_eng_rate ?? 0) >= avg ? 'above' : 'below'} the period average of ${fmtP(avg)}.`;
}

function insightBucketViews(buckets: BucketRow[]): string {
  if (!buckets.length) return 'No bucket data available. Tag posts with a content bucket to see breakdown.';
  const sorted = [...buckets].sort((a, b) => b.total_views - a.total_views);
  const top   = sorted[0]!;
  const total = sorted.reduce((s, r) => s + r.total_views, 0);
  const share = Math.round((top.total_views / Math.max(total, 1)) * 100);
  const top2share = sorted.length > 1
    ? Math.round(((sorted[0]!.total_views + sorted[1]!.total_views) / Math.max(total, 1)) * 100)
    : share;
  return `"${top.content_bucket}" drives the most views with ${fmtN(top.total_views)} (${share}% of total).${sorted.length > 1 ? ` Top 2 buckets account for ${top2share}% of all views.` : ''}`;
}

function insightBucketAER(buckets: BucketRow[]): string {
  if (!buckets.length) return 'No bucket engagement data available.';
  const sorted = [...buckets].sort((a, b) => (b.avg_active_eng_rate ?? 0) - (a.avg_active_eng_rate ?? 0));
  const top    = sorted[0]!;
  const bottom = sorted[sorted.length - 1]!;
  if (sorted.length === 1) return `"${top.content_bucket}" achieves ${fmtP(top.avg_active_eng_rate)} engagement rate.`;
  return `"${top.content_bucket}" leads with ${fmtP(top.avg_active_eng_rate)} engagement rate, while "${bottom.content_bucket}" is lowest at ${fmtP(bottom.avg_active_eng_rate)}. Prioritise high-engagement buckets in the next content calendar.`;
}

function insightViewsByBucket(bucketMOM: BucketMomRow[], uniqueBuckets: string[]): string {
  if (!bucketMOM.length) return 'No bucket MOM data available.';
  const months = [...new Set(bucketMOM.map(r => r.month))].sort();
  if (months.length < 2) return `${uniqueBuckets.length} content bucket(s) tracked across ${months.length} month(s).`;
  const first = months[0]!, last = months[months.length - 1]!;
  let bestBucket = '', bestGrowth = -Infinity;
  for (const b of uniqueBuckets) {
    const f = bucketMOM.find(r => r.month === first && r.content_bucket === b)?.total_views ?? 0;
    const l = bucketMOM.find(r => r.month === last  && r.content_bucket === b)?.total_views ?? 0;
    const growth = f > 0 ? (l - f) / f : 0;
    if (growth > bestGrowth) { bestGrowth = growth; bestBucket = b; }
  }
  const sign = bestGrowth >= 0 ? '+' : '';
  return `"${bestBucket}" shows the strongest view growth at ${sign}${(bestGrowth * 100).toFixed(0)}% from ${monthLbl(first)} to ${monthLbl(last)}.`;
}

function insightAERByBucket(bucketMOM: BucketMomRow[], uniqueBuckets: string[]): string {
  if (!bucketMOM.length) return 'No bucket engagement rate data available.';
  const months = [...new Set(bucketMOM.map(r => r.month))].sort();
  const lastMonth = months[months.length - 1];
  if (!lastMonth) return 'No monthly data found.';
  const latest = uniqueBuckets
    .map(b => ({ bucket: b, rate: bucketMOM.find(r => r.month === lastMonth && r.content_bucket === b)?.avg_active_eng_rate ?? null }))
    .filter(r => r.rate != null);
  if (!latest.length) return `No engagement rate data for ${monthLbl(lastMonth)}.`;
  const best = latest.reduce((a, b) => (b.rate! > a.rate!) ? b : a);
  return `In ${monthLbl(lastMonth)}, "${best.bucket}" leads with a ${fmtP(best.rate)} active engagement rate. Replicate this bucket's content strategy across lower-performing buckets.`;
}

function generateKeyTakeaways(
  mom: MomRow[], sow: SowRow[], buckets: BucketRow[], topPosts: PostWithMetrics[]
): string[] {
  const bullets: string[] = [];

  if (mom.length >= 2) {
    const latest = mom[mom.length - 1]!, prev = mom[mom.length - 2]!;
    const ch = ((latest.total_views - prev.total_views) / Math.max(prev.total_views, 1)) * 100;
    bullets.push(`Views ${ch >= 0 ? 'grew' : 'declined'} by ${Math.abs(ch).toFixed(0)}% MOM in ${monthLbl(latest.month)} — ${ch >= 0 ? 'positive momentum, maintain posting cadence' : 'consider increasing post frequency or experimenting with new formats'}.`);
  }

  if (buckets.length) {
    const top = [...buckets].sort((a, b) => (b.avg_active_eng_rate ?? 0) - (a.avg_active_eng_rate ?? 0))[0]!;
    bullets.push(`"${top.content_bucket}" drives the highest engagement rate at ${fmtP(top.avg_active_eng_rate)} — prioritise this content bucket in upcoming campaigns.`);
  }

  if (sow.length) {
    const byFmt: Record<string, number> = {};
    sow.forEach(r => { byFmt[r.format] = (byFmt[r.format] ?? 0) + r.post_count; });
    const [fmt, cnt] = Object.entries(byFmt).sort((a, b) => b[1] - a[1])[0]!;
    bullets.push(`${fmt} is the most-delivered format with ${cnt} posts — ensure this output aligns with audience engagement data before scaling further.`);
  }

  if (topPosts.length) {
    const tp = topPosts[0]!;
    bullets.push(`Top-performing post achieved ${fmtP(tp.metrics?.active_eng_rate)} engagement rate (${tp.format}) — analyse its content style and timing for replication.`);
  }

  if (mom.length) {
    const totalActive  = mom.reduce((s, r) => s + r.total_active_eng, 0);
    const totalPassive = mom.reduce((s, r) => s + r.total_passive_eng, 0);
    const ratio = totalPassive > 0 ? ((totalActive / totalPassive) * 100).toFixed(0) : '0';
    bullets.push(`Active engagement is ${ratio}% of passive engagement — ${Number(ratio) < 30 ? 'consider stronger CTAs and interactive content to convert passive viewers' : 'healthy active-to-passive ratio; continue driving direct interaction'}.`);
  }

  while (bullets.length < 3) bullets.push('Continue tracking month-on-month performance to identify emerging trends.');
  return bullets.slice(0, 5);
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ExportPPTButton({
  momData, sowData, bucketAnalysis, bucketMOM, uniqueBuckets,
  topPosts, bottomPosts, platform, globalMonth,
  refContentDelivered, refImpressionsEng, refViewsMOM,
  refPassiveEng, refActiveEng, refBucketViews, refBucketAER,
  refViewsByBucket, refAERByBucket,
  insights,
}: ExportPPTButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  async function generate() {
    setIsGenerating(true);
    try {
      // Capture all chart PNGs in parallel
      const refs = [
        refContentDelivered, refImpressionsEng, refViewsMOM,
        refPassiveEng, refActiveEng, refBucketViews, refBucketAER,
        refViewsByBucket, refAERByBucket,
      ];
      const pngs = await Promise.all(
        refs.map(r => r.current ? svgToPng(r.current) : Promise.resolve(null))
      );
      const [
        pngContentDelivered, pngImpressionsEng, pngViewsMOM,
        pngPassiveEng, pngActiveEng, pngBucketViews, pngBucketAER,
        pngViewsByBucket, pngAERByBucket,
      ] = pngs;

      // Dynamic import to avoid SSR
      const PptxGenJS = (await import('pptxgenjs')).default;
      const prs = new PptxGenJS();
      prs.layout = 'LAYOUT_WIDE'; // 13.33" × 7.5"

      // ── Theme ──────────────────────────────────────────────────────────────
      const T = {
        BG:      'FFFFFF',
        ACCENT:  '6366f1',
        LIGHT:   'EEF2FF',
        TITLE:   '111827',
        BODY:    '374151',
        MUTED:   '9CA3AF',
        BORDER:  'E5E7EB',
        ROW_ALT: 'F9FAFB',
        WHITE:   'FFFFFF',
        END_SUB: 'A5B4FC',
      } as const;

      // ── Slide helpers ──────────────────────────────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function addSlideHeader(slide: any, title: string) {
        slide.background = { color: T.BG };
        slide.addShape(prs.ShapeType.rect, {
          x: 0, y: 0, w: 0.06, h: 7.5,
          fill: { color: T.ACCENT }, line: { color: T.ACCENT },
        });
        slide.addText(title, {
          x: 0.25, y: 0.18, w: 13.0, h: 0.55,
          fontSize: 22, bold: true, color: T.TITLE, fontFace: 'Calibri',
        });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function addInsightBox(slide: any, text: string) {
        slide.addShape(prs.ShapeType.rect, {
          x: 0.25, y: 6.42, w: 12.83, h: 0.82,
          fill: { color: T.LIGHT }, line: { color: T.ACCENT, pt: 1 },
        });
        slide.addText('Insight:  ' + text, {
          x: 0.35, y: 6.45, w: 12.63, h: 0.76,
          fontSize: 10.5, color: T.ACCENT, fontFace: 'Calibri', wrap: true,
        });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function addChartImage(slide: any, dataUrl: string | null) {
        if (dataUrl) {
          slide.addImage({
            data: dataUrl,
            x: 0.25, y: 1.22, w: 12.83, h: 5.0,
            sizing: { type: 'contain', x: 0.25, y: 1.22, w: 12.83, h: 5.0 },
          });
        } else {
          slide.addText('No chart data available for this period.', {
            x: 0.25, y: 3.4, w: 12.83, h: 0.6,
            fontSize: 14, color: T.MUTED, align: 'center', fontFace: 'Calibri',
          });
        }
      }

      // ── Derived values ─────────────────────────────────────────────────────
      const totalViews       = momData.reduce((s, r) => s + r.total_views, 0);
      const totalImpressions = momData.reduce((s, r) => s + r.total_impressions, 0);
      const totalActiveEng   = momData.reduce((s, r) => s + r.total_active_eng, 0);
      const bestMonth        = momData.length
        ? momData.reduce((a, b) => b.total_views > a.total_views ? b : a).month
        : null;
      const byFmt: Record<string, number> = {};
      sowData.forEach(r => { byFmt[r.format] = (byFmt[r.format] ?? 0) + r.post_count; });
      const bestFormat = Object.keys(byFmt).length
        ? Object.entries(byFmt).sort((a, b) => b[1] - a[1])[0]![0]
        : '—';

      const filterDesc = [
        platform ? platform : 'All Platforms',
        globalMonth ? monthLbl(globalMonth) : 'All Time',
      ].join('  ·  ');
      const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

      // Unique months + formats for tables
      const tableMonths  = [...new Set(sowData.map(r => r.month))].sort();
      const tableFormats = [...new Set(sowData.map(r => r.format))];
      const FORMAT_COLORS: Record<string, string> = {
        Reel: '6366f1', Static: '14b8a6', Carousel: '8b5cf6',
        Story: 'a78bfa', 'Video Post': '4f46e5', Article: 'f59e0b',
      };

      // ── SLIDE 1: Cover ─────────────────────────────────────────────────────
      {
        const s = prs.addSlide();
        s.background = { color: T.BG };
        s.addShape(prs.ShapeType.rect, {
          x: 0, y: 0, w: 0.06, h: 7.5,
          fill: { color: T.ACCENT }, line: { color: T.ACCENT },
        });
        s.addShape(prs.ShapeType.rect, {
          x: 0.25, y: 5.25, w: 12.83, h: 0.06,
          fill: { color: T.LIGHT }, line: { color: T.LIGHT },
        });
        s.addText('Grapes Worldwide', {
          x: 0.5, y: 1.5, w: 12.33, h: 1.1,
          fontSize: 44, bold: true, color: T.ACCENT, align: 'center', fontFace: 'Calibri',
        });
        s.addText('Social Media Performance Report', {
          x: 0.5, y: 2.75, w: 12.33, h: 0.65,
          fontSize: 20, color: T.BODY, align: 'center', fontFace: 'Calibri',
        });
        s.addText(filterDesc, {
          x: 0.5, y: 3.55, w: 12.33, h: 0.42,
          fontSize: 13, color: T.MUTED, align: 'center', fontFace: 'Calibri',
        });
        s.addText(`Generated: ${today}`, {
          x: 0.5, y: 4.1, w: 12.33, h: 0.35,
          fontSize: 11, color: T.MUTED, align: 'center', fontFace: 'Calibri',
        });
      }

      // ── SLIDE 2: Key Metrics ───────────────────────────────────────────────
      {
        const s = prs.addSlide();
        addSlideHeader(s, 'Key Metrics Summary');
        const kpis = [
          { label: 'TOTAL VIEWS',         value: fmtN(totalViews) },
          { label: 'TOTAL IMPRESSIONS',    value: fmtN(totalImpressions) },
          { label: 'ACTIVE ENGAGEMENT',    value: fmtN(totalActiveEng) },
          { label: 'BEST MONTH',           value: bestMonth ? monthLbl(bestMonth) : '—' },
        ];
        kpis.forEach(({ label, value }, i) => {
          const x = 0.25 + i * 3.27;
          s.addShape(prs.ShapeType.rect, {
            x, y: 1.1, w: 3.0, h: 1.85,
            fill: { color: T.LIGHT }, line: { color: T.ACCENT, pt: 1 },
          });
          s.addText(value, {
            x: x + 0.05, y: 1.32, w: 2.9, h: 0.75,
            fontSize: 28, bold: true, color: T.ACCENT, align: 'center', fontFace: 'Calibri',
          });
          s.addText(label, {
            x: x + 0.05, y: 2.12, w: 2.9, h: 0.4,
            fontSize: 9, color: T.MUTED, align: 'center', fontFace: 'Calibri',
          });
        });
        s.addText(`Top Format: ${bestFormat}`, {
          x: 3.67, y: 3.3, w: 6.0, h: 0.5,
          fontSize: 14, color: T.BODY, align: 'center', fontFace: 'Calibri',
        });
      }

      // ── Chart slide builder ────────────────────────────────────────────────
      const chartSlides: { title: string; subtitle: string; png: string | null; insight: string }[] = [
        {
          title: 'Content Delivered (MOM)',
          subtitle: 'Posts published per month by format',
          png: pngContentDelivered ?? null,
          insight: insights?.contentDelivered ?? insightContentDelivered(sowData),
        },
        {
          title: 'Impressions vs Engagement (MOM)',
          subtitle: 'Total impressions (bars) · Active engagement rate (line)',
          png: pngImpressionsEng ?? null,
          insight: insights?.impressionsEng ?? insightImpressionsEng(momData),
        },
        {
          title: 'Views (MOM)',
          subtitle: 'Total video / post views per month',
          png: pngViewsMOM ?? null,
          insight: insights?.viewsMOM ?? insightViewsMOM(momData),
        },
        {
          title: 'Passive Engagement (MOM)',
          subtitle: 'Passive engagement (bars) · Passive engagement rate (line)',
          png: pngPassiveEng ?? null,
          insight: insights?.passiveEng ?? insightPassiveEng(momData),
        },
        {
          title: 'Active Engagement (MOM)',
          subtitle: 'Active engagement (bars) · Active engagement rate (line)',
          png: pngActiveEng ?? null,
          insight: insights?.activeEng ?? insightActiveEng(momData),
        },
        {
          title: 'Bucket-wise Views',
          subtitle: 'Total views per content bucket',
          png: pngBucketViews ?? null,
          insight: insights?.bucketViews ?? insightBucketViews(bucketAnalysis),
        },
        {
          title: 'Bucket-wise Active Engagement Rate',
          subtitle: 'Average active engagement rate per content bucket',
          png: pngBucketAER ?? null,
          insight: insights?.bucketAER ?? insightBucketAER(bucketAnalysis),
        },
        {
          title: 'Views (MOM) by Bucket',
          subtitle: 'One line per content bucket — month-on-month view trend',
          png: pngViewsByBucket ?? null,
          insight: insights?.bucketViewsMOM ?? insightViewsByBucket(bucketMOM, uniqueBuckets),
        },
        {
          title: 'Active Engagement Rate (MOM) by Bucket',
          subtitle: 'One line per content bucket — month-on-month engagement rate trend',
          png: pngAERByBucket ?? null,
          insight: insights?.bucketAERMOM ?? insightAERByBucket(bucketMOM, uniqueBuckets),
        },
      ];

      for (const cs of chartSlides) {
        const s = prs.addSlide();
        addSlideHeader(s, cs.title);
        s.addText(cs.subtitle, {
          x: 0.25, y: 0.80, w: 12.83, h: 0.35,
          fontSize: 11, color: T.MUTED, fontFace: 'Calibri',
        });
        addChartImage(s, cs.png);
        addInsightBox(s, cs.insight);
      }

      // ── SLIDE 12: Content Delivered Table ──────────────────────────────────
      if (sowData.length) {
        const s = prs.addSlide();
        addSlideHeader(s, 'Content Delivered — Format Breakdown');

        const headerRow = [
          { text: 'Month', options: { bold: true, fontSize: 10, color: T.MUTED, fill: { color: T.ROW_ALT } } },
          ...tableFormats.map(f => ({
            text: f,
            options: { bold: true, fontSize: 10, color: FORMAT_COLORS[f] ?? T.ACCENT, fill: { color: T.ROW_ALT } },
          })),
        ];
        const dataRows = tableMonths.map((m, ri) => {
          const fill = ri % 2 === 0 ? T.BG : T.ROW_ALT;
          return [
            { text: monthLbl(m), options: { fontSize: 10, color: T.TITLE, fill: { color: fill } } },
            ...tableFormats.map(f => {
              const cnt = sowData.find(r => r.month === m && r.format === f)?.post_count ?? 0;
              return {
                text: cnt > 0 ? String(cnt) : '—',
                options: { fontSize: 10, color: cnt > 0 ? T.TITLE : T.MUTED, align: 'center' as const, fill: { color: fill } },
              };
            }),
          ];
        });

        const fmtColW = (12.83 - 2.2) / Math.max(tableFormats.length, 1);
        s.addTable([headerRow, ...dataRows], {
          x: 0.25, y: 1.0, w: 12.83,
          colW: [2.2, ...tableFormats.map(() => fmtColW)],
          border: { type: 'solid', color: T.BORDER, pt: 0.5 },
          fontFace: 'Calibri',
        });
      }

      // ── SLIDE 13: Bucket Analysis Table ────────────────────────────────────
      if (bucketAnalysis.length) {
        const s = prs.addSlide();
        addSlideHeader(s, 'Bucket Analysis');

        const sorted = [...bucketAnalysis].sort((a, b) => b.total_views - a.total_views);
        const headerRow = [
          { text: 'Content Bucket', options: { bold: true, fontSize: 10, color: T.MUTED, fill: { color: T.ROW_ALT } } },
          { text: 'Total Views',    options: { bold: true, fontSize: 10, color: T.MUTED, fill: { color: T.ROW_ALT } } },
          { text: 'Avg. Eng. Rate', options: { bold: true, fontSize: 10, color: T.MUTED, fill: { color: T.ROW_ALT } } },
          { text: 'Posts',          options: { bold: true, fontSize: 10, color: T.MUTED, align: 'center' as const, fill: { color: T.ROW_ALT } } },
        ];
        const dataRows = sorted.map((r, i) => {
          const fill = i % 2 === 0 ? T.BG : T.ROW_ALT;
          return [
            { text: r.content_bucket,                options: { fontSize: 10, color: T.TITLE,  bold: true, fill: { color: fill } } },
            { text: fmtN(r.total_views),              options: { fontSize: 10, color: T.BODY,   fill: { color: fill } } },
            { text: fmtP(r.avg_active_eng_rate),      options: { fontSize: 10, color: T.ACCENT, bold: true, fill: { color: fill } } },
            { text: String(r.post_count),             options: { fontSize: 10, color: T.BODY,   align: 'center' as const, fill: { color: fill } } },
          ];
        });

        s.addTable([headerRow, ...dataRows], {
          x: 0.25, y: 1.0, w: 12.83,
          colW: [4.5, 3.0, 3.33, 2.0],
          border: { type: 'solid', color: T.BORDER, pt: 0.5 },
          fontFace: 'Calibri',
        });
      }

      // ── Post list slide builder ────────────────────────────────────────────
      function addPostListSlide(title: string, posts: PostWithMetrics[], insight?: string) {
        const s = prs.addSlide();
        addSlideHeader(s, title);

        if (!posts.length) {
          s.addText('No posts found for this period.', {
            x: 0.25, y: 3.4, w: 12.83, h: 0.5,
            fontSize: 14, color: T.MUTED, align: 'center', fontFace: 'Calibri',
          });
          if (insight) addInsightBox(s, insight);
          return;
        }

        posts.forEach((p, i) => {
          const y = 1.1 + i * 1.08;
          // Rank badge
          s.addShape(prs.ShapeType.rect, {
            x: 0.25, y, w: 0.38, h: 0.38,
            fill: { color: T.ACCENT }, line: { color: T.ACCENT },
          });
          s.addText(`#${i + 1}`, {
            x: 0.25, y: y + 0.02, w: 0.38, h: 0.34,
            fontSize: 11, bold: true, color: T.WHITE, align: 'center', fontFace: 'Calibri',
          });
          // URL
          const shortUrl = p.post_url.length > 60 ? p.post_url.slice(0, 60) + '…' : p.post_url;
          s.addText(shortUrl, {
            x: 0.72, y, w: 7.2, h: 0.38,
            fontSize: 10, color: T.ACCENT, fontFace: 'Calibri',
            hyperlink: { url: p.post_url },
          });
          // Format
          s.addText(p.format, {
            x: 8.0, y, w: 1.6, h: 0.38,
            fontSize: 10, color: FORMAT_COLORS[p.format] ?? T.ACCENT, fontFace: 'Calibri',
          });
          // Views
          s.addText(fmtN(p.metrics?.views), {
            x: 9.7, y, w: 1.5, h: 0.38,
            fontSize: 10, color: T.BODY, align: 'right', fontFace: 'Calibri',
          });
          // Eng Rate
          s.addText(fmtP(p.metrics?.active_eng_rate), {
            x: 11.3, y, w: 1.73, h: 0.38,
            fontSize: 10, bold: true, color: T.ACCENT, align: 'right', fontFace: 'Calibri',
          });
        });

        // Column headers
        s.addText('URL', {
          x: 0.72, y: 0.85, w: 7.2, h: 0.22, fontSize: 8, color: T.MUTED, fontFace: 'Calibri',
        });
        s.addText('Format', {
          x: 8.0, y: 0.85, w: 1.6, h: 0.22, fontSize: 8, color: T.MUTED, fontFace: 'Calibri',
        });
        s.addText('Views', {
          x: 9.7, y: 0.85, w: 1.5, h: 0.22, fontSize: 8, color: T.MUTED, align: 'right', fontFace: 'Calibri',
        });
        s.addText('Eng. Rate', {
          x: 11.3, y: 0.85, w: 1.73, h: 0.22, fontSize: 8, color: T.MUTED, align: 'right', fontFace: 'Calibri',
        });
        if (insight) addInsightBox(s, insight);
      }

      // ── SLIDES 14 & 15: Post lists ─────────────────────────────────────────
      addPostListSlide(
        'Top 5 Performing Posts',
        topPosts,
        insights?.topPosts ?? 'These are the strongest posts in the selected period and should be used as reference points for future content planning.',
      );
      addPostListSlide(
        'Posts Needing Attention',
        bottomPosts,
        insights?.bottomPosts ?? 'These posts underperformed in the selected period and should be reviewed for hook, format, and CTA changes.',
      );

      // ── SLIDE 16: Key Takeaways ────────────────────────────────────────────
      {
        const s = prs.addSlide();
        addSlideHeader(s, 'Key Takeaways & Recommendations');
        const bullets = generateKeyTakeaways(momData, sowData, bucketAnalysis, topPosts);
        bullets.forEach((text, i) => {
          const y = 1.2 + i * 1.0;
          s.addShape(prs.ShapeType.rect, {
            x: 0.25, y: y + 0.1, w: 0.14, h: 0.14,
            fill: { color: T.ACCENT }, line: { color: T.ACCENT },
          });
          s.addText(text, {
            x: 0.5, y, w: 12.58, h: 0.78,
            fontSize: 12, color: T.BODY, fontFace: 'Calibri', wrap: true,
          });
        });
      }

      // ── SLIDE 17: End ──────────────────────────────────────────────────────
      {
        const s = prs.addSlide();
        s.background = { color: T.ACCENT };
        s.addText('Thank You', {
          x: 0.5, y: 2.4, w: 12.33, h: 1.0,
          fontSize: 44, bold: true, color: T.WHITE, align: 'center', fontFace: 'Calibri',
        });
        s.addText('Grapes Worldwide  ·  Social Analytics', {
          x: 0.5, y: 3.65, w: 12.33, h: 0.5,
          fontSize: 16, color: 'C7D2FE', align: 'center', fontFace: 'Calibri',
        });
        s.addText(today, {
          x: 0.5, y: 4.3, w: 12.33, h: 0.4,
          fontSize: 12, color: T.END_SUB, align: 'center', fontFace: 'Calibri',
        });
      }

      // ── Download ───────────────────────────────────────────────────────────
      const platformSlug = (platform || 'all').toLowerCase().replace(/\s+/g, '-');
      const monthSlug    = globalMonth || 'all-time';
      const dateSlug     = new Date().toISOString().slice(0, 10);
      const fileName     = `grapes-analytics-${platformSlug}-${monthSlug}-${dateSlug}.pptx`;

      await prs.writeFile({ fileName });
      toast.success('PPT downloaded!');
    } catch (err) {
      console.error('PPT generation failed:', err);
      toast.error('PPT generation failed. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <button
      onClick={generate}
      disabled={isGenerating}
      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors print:hidden"
    >
      {isGenerating
        ? <><Loader2 size={14} className="animate-spin" /> Generating…</>
        : <><Presentation size={14} /> Make PPT</>
      }
    </button>
  );
}
