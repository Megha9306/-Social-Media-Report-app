'use client';

import { useState, useRef } from 'react';
import { Users, BarChart3, TrendingUp } from 'lucide-react';
import * as Select from '@radix-ui/react-select';
import { ChevronDown } from 'lucide-react';
import { trpc } from '../../lib/trpc';
import { ChartCard } from '../../components/analytics/ChartCard';
import { MOMLineChart } from '../../components/analytics/MOMLineChart';
import { MOMDualAxisChart } from '../../components/analytics/MOMDualAxisChart';
import { FormatBarChart } from '../../components/analytics/FormatBarChart';
import { BucketBarChart } from '../../components/analytics/BucketBarChart';
import { PostCard } from '../../components/analytics/PostCard';
import { ShareButton } from '../../components/analytics/ShareButton';
import { ExportPDFButton } from '../../components/analytics/ExportPDFButton';
import { ExportPPTButton } from '../../components/analytics/ExportPPTButton';
import type { PostWithMetrics } from '../../types';
import { InsightCard } from '../../components/InsightCard';

const PLATFORMS = ['Instagram', 'Facebook', 'Twitter', 'LinkedIn', 'YouTube'];

const C = {
  primary:   '#6366f1',
  secondary: '#14b8a6',
  accent:    '#8b5cf6',
  amber:     '#f59e0b',
};

const BUCKET_PALETTE = [C.primary, C.secondary, C.accent, C.amber, '#ec4899', '#22c55e', '#f97316', '#06b6d4'];

const numFmt = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(1)}K` : `${v}`;

const pctFmt = (v: number) => `${(v * 100).toFixed(2)}%`;

function FilterSelect({
  label,
  value,
  options,
  onValueChange,
}: {
  label: string;
  value: string;
  options: string[];
  onValueChange: (v: string) => void;
}) {
  return (
    <Select.Root value={value || '__all__'} onValueChange={v => onValueChange(v === '__all__' ? '' : v)}>
      <Select.Trigger className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 min-w-[130px] print:hidden">
        <Select.Value placeholder={label} />
        <ChevronDown size={14} className="ml-auto text-gray-400" />
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="z-50 bg-white rounded-lg border border-gray-200 shadow-lg overflow-hidden">
          <Select.Viewport className="p-1">
            <Select.Item value="__all__" className="flex items-center px-2 py-1.5 text-sm text-gray-500 cursor-pointer rounded hover:bg-gray-50 focus:outline-none focus:bg-gray-100">
              <Select.ItemText>All {label}s</Select.ItemText>
            </Select.Item>
            {options.map(opt => (
              <Select.Item key={opt} value={opt} className="flex items-center px-2 py-1.5 text-sm text-gray-700 cursor-pointer rounded hover:bg-indigo-50 focus:outline-none focus:bg-indigo-50">
                <Select.ItemText>{opt}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

function SectionHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      {children && <div className="flex flex-wrap items-center gap-2 print:hidden">{children}</div>}
    </div>
  );
}

/** Converts a "YYYY-MM" month string to a date range for post_published_at filtering */
function monthToRange(month: string): { date_from?: string; date_to?: string } {
  if (!month) return {};
  return { date_from: `${month}-01`, date_to: `${month}-31` };
}

export default function AnalysisPage() {
  const [platform, setPlatform]           = useState('');
  const [globalMonth, setGlobalMonth]     = useState('');
  const [contentMonth, setContentMonth]   = useState('');
  const [contentBucket, setContentBucket] = useState('');
  const [postMonth, setPostMonth]         = useState('');

  // Chart container refs for PPT export (one per rendered chart, skipping followers)
  const refContentDelivered = useRef<HTMLDivElement>(null);
  const refImpressionsEng   = useRef<HTMLDivElement>(null);
  const refViewsMOM         = useRef<HTMLDivElement>(null);
  const refPassiveEng       = useRef<HTMLDivElement>(null);
  const refActiveEng        = useRef<HTMLDivElement>(null);
  const refBucketViews      = useRef<HTMLDivElement>(null);
  const refBucketAER        = useRef<HTMLDivElement>(null);
  const refViewsByBucket    = useRef<HTMLDivElement>(null);
  const refAERByBucket      = useRef<HTMLDivElement>(null);

  const baseFilters = {
    platform: platform || undefined,
  };

  // Section 1 – MOM
  const momQuery = trpc.reports.analyticsMOM.useQuery(
    { ...baseFilters, ...monthToRange(globalMonth) },
  );
  const sowQuery = trpc.reports.deliveredSOW.useQuery(
    { ...baseFilters, ...monthToRange(globalMonth) },
  );

  // Section 2 – Content analysis
  const bucketsQuery    = trpc.reports.contentBuckets.useQuery();
  const bucketAnalysisQ = trpc.reports.bucketAnalysis.useQuery({
    ...baseFilters,
    ...monthToRange(contentMonth),
    content_bucket: contentBucket || undefined,
  });
  const bucketMOMQ = trpc.reports.bucketMOM.useQuery({
    ...baseFilters,
    ...monthToRange(contentMonth),
    content_bucket: contentBucket || undefined,
  });

  // AI insights — wait for MOM data to finish loading (not just isSuccess which persists
  // across filter changes) so insights always correspond to the current filter state
  const insightsQ = trpc.reports.generateInsights.useQuery(
    { ...baseFilters, ...monthToRange(globalMonth) },
    { enabled: momQuery.isSuccess && !momQuery.isFetching, retry: 1 },
  );
  const ins = insightsQ.data;
  const insLoading = (insightsQ.isLoading || insightsQ.isFetching) && !insightsQ.isError;
  const insError = insightsQ.isError;

  // Section 3 – Post analysis: separate queries for top and bottom
  const topPostsQ = trpc.reports.topPosts.useQuery({
    ...baseFilters,
    ...monthToRange(postMonth),
    sortBy: 'weighted_score',
    sortDir: 'desc',
    limit: 5,
  });
  const bottomPostsQ = trpc.reports.topPosts.useQuery({
    ...baseFilters,
    ...monthToRange(postMonth),
    sortBy: 'weighted_score',
    sortDir: 'asc',
    limit: 5,
  });

  const momData        = momQuery.data ?? [];
  const sowData        = sowQuery.data ?? [];
  const bucketAnalysis = bucketAnalysisQ.data ?? [];
  const bucketMOM      = bucketMOMQ.data ?? [];
  const buckets        = bucketsQuery.data ?? [];
  const topPosts       = (topPostsQ.data    ?? []) as PostWithMetrics[];
  const bottomPosts    = (bottomPostsQ.data ?? []) as PostWithMetrics[];

  // Pivot bucket MOM data for multi-line chart
  const uniqueBuckets = [...new Set(bucketMOM.map(r => r.content_bucket))];
  const bucketMOMByMonth = (() => {
    const months = [...new Set(bucketMOM.map(r => r.month))].sort();
    return months.map(month => {
      const row: Record<string, unknown> = { month };
      for (const b of uniqueBuckets) {
        const found = bucketMOM.find(r => r.month === month && r.content_bucket === b);
        row[`views_${b}`] = found?.total_views ?? 0;
        row[`aer_${b}`]   = found?.avg_active_eng_rate ?? null;
      }
      return row;
    });
  })();

  const viewsSeries = uniqueBuckets.map((b, i) => ({
    dataKey: `views_${b}`,
    label: b,
    color: BUCKET_PALETTE[i % BUCKET_PALETTE.length],
    formatter: numFmt,
  }));
  const aerSeries = uniqueBuckets.map((b, i) => ({
    dataKey: `aer_${b}`,
    label: b,
    color: BUCKET_PALETTE[i % BUCKET_PALETTE.length],
    formatter: pctFmt,
  }));

  const platformLabel = platform ? platform : 'All Platforms';

  return (
    <div className="space-y-10 print:space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Social Analytics Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">{platformLabel} · Month-on-Month performance overview</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <FilterSelect
            label="Platform"
            value={platform}
            options={PLATFORMS}
            onValueChange={setPlatform}
          />
          <input
            type="month"
            value={globalMonth}
            onChange={e => setGlobalMonth(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          <ExportPPTButton
            momData={momData}
            sowData={sowData}
            bucketAnalysis={bucketAnalysis}
            bucketMOM={bucketMOM}
            uniqueBuckets={uniqueBuckets}
            topPosts={topPosts}
            bottomPosts={bottomPosts}
            insights={ins}
            platform={platform}
            globalMonth={globalMonth}
            refContentDelivered={refContentDelivered}
            refImpressionsEng={refImpressionsEng}
            refViewsMOM={refViewsMOM}
            refPassiveEng={refPassiveEng}
            refActiveEng={refActiveEng}
            refBucketViews={refBucketViews}
            refBucketAER={refBucketAER}
            refViewsByBucket={refViewsByBucket}
            refAERByBucket={refAERByBucket}
          />
          <ShareButton />
          <ExportPDFButton />
        </div>
      </div>

      {/* Section 1: MOM */}
      <section>
        <SectionHeader title="Month-on-Month (MOM)" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <ChartCard
            title="Followers Growth (MOM)"
            subtitle="Requires account connection"
            isEmpty
            emptyIcon={<Users size={40} />}
            emptyMessage="Connect a social account to track follower growth over time. See Settings → Account Connector."
          >
            <span />
          </ChartCard>

          <div ref={refContentDelivered} style={{ display: 'contents' }}>
            <ChartCard
              title="Content Delivered (MOM)"
              subtitle="Posts published per month by format"
              isLoading={sowQuery.isLoading}
              isEmpty={!sowQuery.isLoading && sowData.length === 0}
              emptyMessage="No posts with publish dates found. Ensure posts have a post_published_at date set."
              emptyIcon={<BarChart3 size={36} />}
            >
              <FormatBarChart data={sowData} />
              <InsightCard text={ins?.contentDelivered} loading={insLoading} error={insError} />
            </ChartCard>
          </div>

          <div ref={refImpressionsEng} style={{ display: 'contents' }}>
            <ChartCard
              title="Impressions vs Engagement (MOM)"
              subtitle="Total impressions (bars) · Active engagement rate (line)"
              isLoading={momQuery.isLoading}
              isEmpty={!momQuery.isLoading && momData.length === 0}
              emptyIcon={<BarChart3 size={36} />}
            >
              <MOMDualAxisChart
                data={momData}
                barKey="total_impressions"
                barLabel="Impressions"
                barColor={C.primary}
                lineKey="avg_active_eng_rate"
                lineLabel="Eng. Rate"
                lineColor={C.secondary}
                barFormatter={numFmt}
                lineFormatter={pctFmt}
              />
              <InsightCard text={ins?.impressionsEng} loading={insLoading} error={insError} />
            </ChartCard>
          </div>

          <div ref={refViewsMOM} style={{ display: 'contents' }}>
            <ChartCard
              title="Views (MOM)"
              subtitle="Total video/post views per month"
              isLoading={momQuery.isLoading}
              isEmpty={!momQuery.isLoading && momData.length === 0}
              emptyIcon={<TrendingUp size={36} />}
            >
              <MOMLineChart
                data={momData}
                series={[{ dataKey: 'total_views', label: 'Views', color: C.accent }]}
                area
                yFormatter={numFmt}
              />
              <InsightCard text={ins?.viewsMOM} loading={insLoading} error={insError} />
            </ChartCard>
          </div>

          <div ref={refPassiveEng} style={{ display: 'contents' }}>
            <ChartCard
              title="Passive Engagement vs Engagement Rate (MOM)"
              subtitle="Passive engagement (bars) · Passive engagement rate (line)"
              isLoading={momQuery.isLoading}
              isEmpty={!momQuery.isLoading && momData.length === 0}
              emptyIcon={<BarChart3 size={36} />}
            >
              <MOMDualAxisChart
                data={momData}
                barKey="total_passive_eng"
                barLabel="Passive Engagement"
                barColor={C.amber}
                lineKey="avg_passive_eng_rate"
                lineLabel="Passive Eng. Rate"
                lineColor={C.primary}
                barFormatter={numFmt}
                lineFormatter={pctFmt}
              />
              <InsightCard text={ins?.passiveEng} loading={insLoading} error={insError} />
            </ChartCard>
          </div>

          <div ref={refActiveEng} style={{ display: 'contents' }}>
            <ChartCard
              title="Active Engagement vs Engagement Rate (MOM)"
              subtitle="Active engagement (bars) · Active engagement rate (line)"
              isLoading={momQuery.isLoading}
              isEmpty={!momQuery.isLoading && momData.length === 0}
              emptyIcon={<BarChart3 size={36} />}
            >
              <MOMDualAxisChart
                data={momData}
                barKey="total_active_eng"
                barLabel="Active Engagement"
                barColor={C.secondary}
                lineKey="avg_active_eng_rate"
                lineLabel="Active Eng. Rate"
                lineColor={C.accent}
                barFormatter={numFmt}
                lineFormatter={pctFmt}
              />
              <InsightCard text={ins?.activeEng} loading={insLoading} error={insError} />
            </ChartCard>
          </div>

        </div>
      </section>

      {/* Section 2: Content Analysis */}
      <section>
        <SectionHeader title="Content Analysis">
          <input
            type="month"
            value={contentMonth}
            onChange={e => setContentMonth(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          <FilterSelect
            label="Bucket"
            value={contentBucket}
            options={buckets}
            onValueChange={setContentBucket}
          />
        </SectionHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <div ref={refBucketViews} style={{ display: 'contents' }}>
            <ChartCard
              title="Bucket-wise Views"
              subtitle="Total views per content bucket"
              isLoading={bucketAnalysisQ.isLoading}
              isEmpty={!bucketAnalysisQ.isLoading && bucketAnalysis.length === 0}
              emptyMessage="No content buckets found. Tag your posts with a content bucket to see breakdown."
              emptyIcon={<BarChart3 size={36} />}
            >
              <BucketBarChart
                data={bucketAnalysis.map(r => ({ content_bucket: r.content_bucket, value: r.total_views }))}
                valueLabel="Views"
                valueFormatter={numFmt}
                horizontal={bucketAnalysis.length > 4}
              />
              <InsightCard text={ins?.bucketViews} loading={insLoading} error={insError} />
            </ChartCard>
          </div>

          <div ref={refBucketAER} style={{ display: 'contents' }}>
            <ChartCard
              title="Bucket-wise Active Engagement Rate"
              subtitle="Average active engagement rate per content bucket"
              isLoading={bucketAnalysisQ.isLoading}
              isEmpty={!bucketAnalysisQ.isLoading && bucketAnalysis.length === 0}
              emptyMessage="No content buckets found. Tag your posts with a content bucket to see breakdown."
              emptyIcon={<BarChart3 size={36} />}
            >
              <BucketBarChart
                data={bucketAnalysis.map(r => ({
                  content_bucket: r.content_bucket,
                  value: r.avg_active_eng_rate ?? 0,
                }))}
                valueLabel="Avg. Active Eng. Rate"
                valueFormatter={pctFmt}
                horizontal={bucketAnalysis.length > 4}
              />
              <InsightCard text={ins?.bucketAER} loading={insLoading} error={insError} />
            </ChartCard>
          </div>

          <div ref={refViewsByBucket} style={{ display: 'contents' }}>
            <ChartCard
              title="Views (MOM) by Bucket"
              subtitle={contentBucket ? `Bucket: ${contentBucket}` : 'All buckets — one line per bucket'}
              isLoading={bucketMOMQ.isLoading}
              isEmpty={!bucketMOMQ.isLoading && bucketMOMByMonth.length === 0}
              emptyIcon={<TrendingUp size={36} />}
            >
              <MOMLineChart
                data={bucketMOMByMonth}
                series={viewsSeries.length > 0 ? viewsSeries : [{ dataKey: 'total_views', label: 'Views', color: C.primary }]}
                yFormatter={numFmt}
              />
              <InsightCard text={ins?.bucketViewsMOM} loading={insLoading} error={insError} />
            </ChartCard>
          </div>

          <div ref={refAERByBucket} style={{ display: 'contents' }}>
            <ChartCard
              title="Active Engagement Rate (MOM) by Bucket"
              subtitle={contentBucket ? `Bucket: ${contentBucket}` : 'All buckets — one line per bucket'}
              isLoading={bucketMOMQ.isLoading}
              isEmpty={!bucketMOMQ.isLoading && bucketMOMByMonth.length === 0}
              emptyIcon={<TrendingUp size={36} />}
            >
              <MOMLineChart
                data={bucketMOMByMonth}
                series={aerSeries.length > 0 ? aerSeries : [{ dataKey: 'avg_active_eng_rate', label: 'Eng. Rate', color: C.secondary }]}
                yFormatter={pctFmt}
              />
              <InsightCard text={ins?.bucketAERMOM} loading={insLoading} error={insError} />
            </ChartCard>
          </div>

        </div>
      </section>

      {/* Section 3: Post Analysis */}
      <section className="pb-8">
        <SectionHeader title="Post Analysis">
          <input
            type="month"
            value={postMonth}
            onChange={e => setPostMonth(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </SectionHeader>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">

          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Top 5 Performing Posts</h3>
            {topPostsQ.isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2, 3, 4].map(i => (
                  <div key={i} className="h-20 bg-white rounded-xl border border-gray-100 animate-pulse" />
                ))}
              </div>
            ) : topPosts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 bg-white rounded-xl border border-gray-100 text-center">
                <TrendingUp size={32} className="text-gray-200 mb-2" />
                <p className="text-sm text-gray-400">No posts found for this period.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {topPosts.map((post, i) => (
                  <PostCard key={post.id} post={post} rank={i + 1} variant="top" />
                ))}
              </div>
            )}
            <InsightCard text={ins?.topPosts} loading={insLoading} error={insError} />
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Top 5 Least Performing Posts</h3>
            {bottomPostsQ.isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2, 3, 4].map(i => (
                  <div key={i} className="h-20 bg-white rounded-xl border border-gray-100 animate-pulse" />
                ))}
              </div>
            ) : bottomPosts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 bg-white rounded-xl border border-gray-100 text-center">
                <TrendingUp size={32} className="text-gray-200 mb-2" />
                <p className="text-sm text-gray-400">No posts found for this period.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {bottomPosts.map((post, i) => (
                  <PostCard key={post.id} post={post} rank={i + 1} variant="bottom" />
                ))}
              </div>
            )}
            <InsightCard text={ins?.bottomPosts} loading={insLoading} error={insError} />
          </div>

        </div>
      </section>

    </div>
  );
}
