'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, ChevronDown, Trash2, History, X } from 'lucide-react';
import * as Select from '@radix-ui/react-select';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { trpc } from '../../lib/trpc';
import { useScrapingLimit } from '../../context/ScrapingLimitContext';
import { HandleInput, type HandleEntry, detectPlatform } from '../../components/competitor/HandleInput';
import { RunProgress } from '../../components/competitor/RunProgress';
import { CompareBarChart } from '../../components/competitor/CompareBarChart';
import { EngagementTrend } from '../../components/competitor/EngagementTrend';
import { PostsCompareTable } from '../../components/competitor/PostsCompareTable';
import { ChartCard } from '../../components/analytics/ChartCard';
import { ShareButton } from '../../components/analytics/ShareButton';
import { ExportPDFButton } from '../../components/analytics/ExportPDFButton';
import { ExportPPTButton } from '../../components/competitor/ExportPPTButton';
import { fmtPct } from '../../utils/formatters';
import { InsightCard } from '../../components/InsightCard';

// ─── Default handles ──────────────────────────────────────────────────────────
const DEFAULT_ENTRIES: HandleEntry[] = [
  { label: 'Me',     handle: '', is_self: true,  platform: 'instagram' },
  { label: 'Comp 1', handle: '', is_self: false, platform: 'instagram' },
  { label: 'Comp 2', handle: '', is_self: false, platform: 'instagram' },
];

const numFmt = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(1)}K` : `${v}`;

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ title }: { title: string }) {
  return <h2 className="text-base font-semibold text-gray-900 mb-5">{title}</h2>;
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CompetitorAnalysisPage() {
  const { disabled: scrapingDisabled } = useScrapingLimit();
  const [entries, setEntries]       = useState<HandleEntry[]>(DEFAULT_ENTRIES);
  const [setName, setSetName]       = useState('Untitled');
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [viewRunId, setViewRunId]   = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [scrapeFrom, setScrapeFrom] = useState(() => new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10));
  const [scrapeTo,   setScrapeTo]   = useState(() => new Date().toISOString().slice(0, 10));
  const [trendMetric, setTrendMetric] = useState<'engagement' | 'engagement_rate' | 'likes' | 'views'>('engagement');
  const pollingRef    = useRef<ReturnType<typeof setInterval> | null>(null); // kept for ref cleanup safety
  const refFollowers   = useRef<HTMLDivElement>(null);
  const refEngRate     = useRef<HTMLDivElement>(null);
  const refEngagement  = useRef<HTMLDivElement>(null);
  const refLikes       = useRef<HTMLDivElement>(null);
  const refComments    = useRef<HTMLDivElement>(null);
  const refViews       = useRef<HTMLDivElement>(null);
  const refTrend       = useRef<HTMLDivElement>(null);

  // ── tRPC ──────────────────────────────────────────────────────────────────
  const setsQuery   = trpc.competitor.listSets.useQuery();
  const setQuery    = trpc.competitor.getSet.useQuery(
    { setId: activeSetId! },
    { enabled: !!activeSetId },
  );
  const runsQuery   = trpc.competitor.listRuns.useQuery(
    { setId: activeSetId! },
    { enabled: !!activeSetId },
  );
  const runStatus = trpc.competitor.getRunStatus.useQuery(
    { runId: activeRunId! },
    {
      enabled: !!activeRunId,
      // React Query polls automatically; no manual setInterval needed
      refetchInterval: (query) => {
        const s = query.state.data?.run.status;
        return (s === 'running' || s === 'pending') ? 3000 : false;
      },
      refetchIntervalInBackground: false,
    },
  );
  const statusQuery = runStatus; // alias kept so downstream references compile
  const resultsQuery = trpc.competitor.getRunResults.useQuery(
    { runId: viewRunId! },
    { enabled: !!viewRunId },
  );

  const insightsQuery = trpc.competitor.generateInsights.useQuery(
    { runId: viewRunId! },
    { enabled: !!viewRunId && resultsQuery.isSuccess },
  );
  const ins = insightsQuery.data;
  const insLoading = (insightsQuery.isLoading || insightsQuery.isFetching) && !insightsQuery.isError;
  const insError = insightsQuery.isError;

  const startRun = trpc.competitor.startRun.useMutation({
    onSuccess: ({ runId, setId }) => {
      setActiveRunId(runId);
      setActiveSetId(setId);
      setsQuery.refetch();
    },
    onError: e => toast.error(e.message),
  });

  const deleteSet = trpc.competitor.deleteSet.useMutation({
    onSuccess: () => {
      setActiveSetId(null);
      setActiveRunId(null);
      setViewRunId(null);
      setsQuery.refetch();
      toast.success('Set deleted');
    },
    onError: e => toast.error(e.message),
  });

  const [deletingRunId, setDeletingRunId] = useState<string | null>(null);
  const deleteRun = trpc.competitor.deleteRun.useMutation({
    onMutate: ({ runId }) => setDeletingRunId(runId),
    onSuccess: (_, { runId }) => {
      if (viewRunId === runId) setViewRunId(null);
      if (activeRunId === runId) setActiveRunId(null);
      runsQuery.refetch();
      toast.success('Run deleted');
    },
    onError: e => toast.error(e.message),
    onSettled: () => setDeletingRunId(null),
  });

  const updatePostMutation = trpc.competitor.updatePost.useMutation({
    onError: e => toast.error(e.message),
  });

  // ── React Query handles polling via refetchInterval above.
  //    This effect only reacts to run completion to update the view. ──────────
  const runStatusValue = statusQuery.data?.run.status;
  const isRunning = runStatusValue === 'running' || runStatusValue === 'pending';

  useEffect(() => {
    if (activeRunId && (runStatusValue === 'completed' || runStatusValue === 'partial' || runStatusValue === 'failed')) {
      setViewRunId(activeRunId);
      runsQuery.refetch();
    }
  }, [runStatusValue, activeRunId]);

  // ── When a set loads, populate the input fields ───────────────────────────
  useEffect(() => {
    if (!setQuery.data) return;
    const { set, accounts } = setQuery.data;
    setSetName(set.name);
    if (accounts.length > 0) {
      setEntries(accounts.map(a => ({
        label:    a.label,
        handle:   a.handle,
        is_self:  Boolean(a.is_self),
        // Always re-detect from handle so old saved sets with wrong platform get corrected
        platform: detectPlatform(a.handle),
      })));
    }
  }, [setQuery.data]);

  // ── When runs load for a set, auto-select the latest completed run ────────
  const runs = runsQuery.data ?? [];
  useEffect(() => {
    if (runs.length === 0 || activeRunId) return; // don't override a fresh run
    const latest =
      runs.find(r => r.status === 'completed' || r.status === 'partial') ??
      runs.find(r => r.status === 'failed');
    if (latest) setViewRunId(latest.id);
  }, [runs]);

  // ── Date-based run selection ───────────────────────────────────────────────
  useEffect(() => {
    if (!selectedDate || runs.length === 0) return;
    const target = new Date(selectedDate).getTime();
    const closest = [...runs].sort((a, b) =>
      Math.abs(new Date(a.triggered_at).getTime() - target) -
      Math.abs(new Date(b.triggered_at).getTime() - target)
    )[0];
    if (closest) setViewRunId(closest.id);
  }, [selectedDate, runs]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleAnalyze() {
    const valid = entries.filter(e => e.handle.trim());
    if (valid.length === 0) {
      toast.error('Enter at least one handle or profile URL');
      return;
    }
    if (scrapeFrom && scrapeTo && scrapeFrom > scrapeTo) {
      toast.error('Start date must be before end date');
      return;
    }
    setSelectedDate(''); // reset stale date selection when starting a new run
    startRun.mutate({
      setName,
      setId: activeSetId ?? undefined,
      accounts: valid.map(e => ({
        label:    e.label,
        handle:   e.handle.trim(),
        is_self:  e.is_self,
        platform: e.platform,
      })),
      fromDate: scrapeFrom,
      toDate:   scrapeTo,
    });
  }

  function loadSet(setId: string) {
    setActiveSetId(setId);
    setActiveRunId(null);  // clear any fresh run so auto-select effect can fire
    setViewRunId(null);
    setSelectedDate('');
  }

  // ── Derived data from results ──────────────────────────────────────────────
  const runResults = resultsQuery.data?.results ?? [];
  const resultAccounts = runResults.map(r => ({
    label:               r.account.label,
    handle:              r.account.handle,
    is_self:             Boolean(r.account.is_self),
    followers:           r.accountRun.followers,
    avg_likes:           r.accountRun.avg_likes,
    avg_comments:        r.accountRun.avg_comments,
    avg_views:           r.accountRun.avg_views,
    avg_engagement:      r.accountRun.avg_engagement,
    avg_engagement_rate: r.accountRun.avg_engagement_rate,
    status:              r.accountRun.status,
  }));

  const accountPosts = runResults.map(r => ({
    label:  r.account.label,
    handle: r.account.handle,
    posts:  r.posts,
  }));

  const hasResults = runResults.length > 0 && !isRunning;

  return (
    <div className="space-y-8 print:space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Competitor Analysis</h1>
          <p className="text-sm text-gray-400 mt-0.5">Compare social media performance across accounts</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {activeSetId && runs.length > 0 && (
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              title="Filter by run date"
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          )}
          <ShareButton />
          <ExportPDFButton />
          <ExportPPTButton
            resultsData={resultsQuery.data}
            activeSetId={activeSetId}
            setName={setName}
            refFollowers={refFollowers}
            refEngRate={refEngRate}
            refEngagement={refEngagement}
            refLikes={refLikes}
            refComments={refComments}
            refViews={refViews}
            refTrend={refTrend}
            trendMetric={trendMetric}
          />
        </div>
      </div>

      {/* ── Input section ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <input
              value={setName}
              onChange={e => setSetName(e.target.value)}
              placeholder="Set name…"
              className="w-40 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            {/* Saved sets picker */}
            {(setsQuery.data?.length ?? 0) > 0 && (
              <Select.Root onValueChange={loadSet}>
                <Select.Trigger className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 min-w-[140px]">
                  <History size={13} className="text-gray-400" />
                  <Select.Value placeholder="Load saved set" />
                  <ChevronDown size={13} className="ml-auto text-gray-400" />
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="z-50 bg-white rounded-lg border border-gray-200 shadow-lg overflow-hidden">
                    <Select.Viewport className="p-1">
                      {setsQuery.data?.map(s => (
                        <Select.Item key={s.id} value={s.id} className="flex items-center px-2 py-1.5 text-sm text-gray-700 cursor-pointer rounded hover:bg-indigo-50 focus:outline-none focus:bg-indigo-50">
                          <Select.ItemText>{s.name} ({s.accountCount} accounts)</Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-gray-500 font-medium">From</label>
            <input
              type="date"
              value={scrapeFrom}
              onChange={e => setScrapeFrom(e.target.value)}
              className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            <label className="text-xs text-gray-500 font-medium">To</label>
            <input
              type="date"
              value={scrapeTo}
              onChange={e => setScrapeTo(e.target.value)}
              className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            {activeSetId && (
              <button
                onClick={() => deleteSet.mutate({ setId: activeSetId })}
                className="flex items-center gap-1.5 rounded-lg border border-red-100 px-3 py-1.5 text-sm text-red-400 hover:border-red-300 hover:text-red-600 transition-colors"
              >
                <Trash2 size={13} />
                Delete Set
              </button>
            )}
            <button
              onClick={handleAnalyze}
              disabled={startRun.isPending || isRunning || scrapingDisabled}
              title={scrapingDisabled ? 'Scraping paused — usage limit exceeded' : undefined}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {startRun.isPending || isRunning ? (
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Play size={13} />
              )}
              Analyze
            </button>
          </div>
        </div>

        <HandleInput entries={entries} onChange={setEntries} />
      </div>

      {/* ── Run history (if set has prior runs) ─────────────────────────── */}
      {activeSetId && runs.length > 1 && !isRunning && (
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <span className="text-xs text-gray-400 font-medium">Run history:</span>
          {runs.slice(0, 10).map(r => (
            <div key={r.id} className="relative group flex items-center">
              <button
                onClick={() => setViewRunId(r.id)}
                className={`text-xs px-2.5 py-1 pr-6 rounded-lg border transition-colors ${
                  viewRunId === r.id
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300'
                }`}
              >
                {new Date(r.triggered_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {r.status === 'partial' && ' ⚠'}
                {r.status === 'failed'  && ' ✕'}
                {r.status === 'running' && ' …'}
              </button>
              <button
                onClick={e => { e.stopPropagation(); deleteRun.mutate({ runId: r.id }); }}
                disabled={deletingRunId === r.id}
                title="Delete this run"
                className={`absolute right-1 flex items-center justify-center w-4 h-4 rounded transition-opacity ${
                  viewRunId === r.id
                    ? 'text-indigo-200 hover:text-white'
                    : 'text-gray-300 hover:text-gray-600'
                } ${deletingRunId === r.id ? 'opacity-40 cursor-not-allowed' : 'opacity-0 group-hover:opacity-100'}`}
              >
                <X size={10} strokeWidth={2.5} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Scraping progress ────────────────────────────────────────────── */}
      <AnimatePresence>
        {(isRunning || runStatusValue === 'failed') && statusQuery.data && (
          <motion.div
            key="progress"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
          >
            <RunProgress
              progress={statusQuery.data.progress}
              overallStatus={statusQuery.data.run.status}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Results ─────────────────────────────────────────────────────── */}
      {resultsQuery.isLoading && viewRunId && (
        <div className="text-center py-12 text-sm text-gray-400 animate-pulse">Loading results…</div>
      )}

      <AnimatePresence>
        {hasResults && (
          <motion.div
            key="results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-8"
          >
            {/* Section 1: Post Comparison (per-post metrics, 2×2 grid) */}
            <section>
              <SectionHeader title="Post Comparison" />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div ref={refEngagement} style={{ display: 'contents' }}>
                  <ChartCard title="Avg. Engagement per Post" subtitle="Average engagement (likes + comments) per post">
                    <CompareBarChart
                      accounts={resultAccounts}
                      metric="avg_engagement"
                      title="Avg. Engagement"
                      formatter={v => numFmt(Math.round(v))}
                    />
                    <InsightCard text={ins?.engagement} loading={insLoading} error={insError} />
                  </ChartCard>
                </div>

                <div ref={refLikes} style={{ display: 'contents' }}>
                  <ChartCard title="Avg. Likes per Post" subtitle="Average likes across scraped posts">
                    <CompareBarChart
                      accounts={resultAccounts}
                      metric="avg_likes"
                      title="Avg. Likes"
                      formatter={v => numFmt(Math.round(v))}
                    />
                    <InsightCard text={ins?.likes} loading={insLoading} error={insError} />
                  </ChartCard>
                </div>

                <div ref={refComments} style={{ display: 'contents' }}>
                  <ChartCard title="Avg. Comments per Post" subtitle="Average comments across scraped posts">
                    <CompareBarChart
                      accounts={resultAccounts}
                      metric="avg_comments"
                      title="Avg. Comments"
                      formatter={v => numFmt(Math.round(v))}
                    />
                    <InsightCard text={ins?.comments} loading={insLoading} error={insError} />
                  </ChartCard>
                </div>

                <div ref={refViews} style={{ display: 'contents' }}>
                  <ChartCard title="Avg. Views per Post" subtitle="Average views (Reels/Videos)">
                    <CompareBarChart
                      accounts={resultAccounts}
                      metric="avg_views"
                      title="Avg. Views"
                      formatter={v => numFmt(Math.round(v))}
                    />
                    <InsightCard text={ins?.views} loading={insLoading} error={insError} />
                  </ChartCard>
                </div>
              </div>
            </section>

            {/* Section 2: Metric Breakdown (account-level metrics) */}
            <section>
              <SectionHeader title="Metric Breakdown" />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div ref={refFollowers} style={{ display: 'contents' }}>
                  <ChartCard title="Followers" subtitle="Total follower count per account">
                    <CompareBarChart
                      accounts={resultAccounts}
                      metric="followers"
                      title="Followers"
                      formatter={numFmt}
                    />
                    <InsightCard text={ins?.followers} loading={insLoading} error={insError} />
                  </ChartCard>
                </div>

                <div ref={refEngRate} style={{ display: 'contents' }}>
                  <ChartCard title="Avg. Engagement Rate" subtitle="Average engagement rate per post">
                    <CompareBarChart
                      accounts={resultAccounts}
                      metric="avg_engagement_rate"
                      title="Avg. Eng. Rate"
                      formatter={v => fmtPct(v, 2)}
                    />
                    <InsightCard text={ins?.engRate} loading={insLoading} error={insError} />
                  </ChartCard>
                </div>
              </div>
            </section>

            {/* Section 3: Engagement trend */}
            <section>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <h2 className="text-base font-semibold text-gray-900">Engagement Trend (Monthly)</h2>
                <div className="flex gap-2 print:hidden">
                  {(['engagement', 'engagement_rate', 'likes', 'views'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setTrendMetric(m)}
                      className={`text-xs px-3 py-1 rounded-lg border transition-colors ${
                        trendMetric === m
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300'
                      }`}
                    >
                      {m === 'engagement_rate' ? 'Eng. Rate' : m.charAt(0).toUpperCase() + m.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div ref={refTrend} style={{ display: 'contents' }}>
                <ChartCard
                  title=""
                  subtitle=""
                  isEmpty={accountPosts.every(a => a.posts.length === 0)}
                  emptyMessage="No posts scraped yet."
                >
                  <EngagementTrend accounts={accountPosts} metric={trendMetric} />
                  <InsightCard text={ins?.trend} loading={insLoading} error={insError} />
                </ChartCard>
              </div>
            </section>

            {/* Section 4: Posts table */}
            <section className="pb-8">
              <SectionHeader title="Post-level Data" />
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <PostsCompareTable
                  accounts={accountPosts}
                  onUpdatePost={async (postId, field, value) => {
                    await updatePostMutation.mutateAsync({ postId, [field]: value || undefined });
                  }}
                />
              </div>
              <InsightCard text={ins?.posts} loading={insLoading} error={insError} />
            </section>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state when no run has been made yet */}
      {!isRunning && !hasResults && !resultsQuery.isLoading && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Play size={32} className="text-gray-200 mb-3" />
          <p className="text-sm text-gray-400">Enter social media handles or profile URLs above and click <strong>Analyze</strong> to start.</p>
        </div>
      )}
    </div>
  );
}
