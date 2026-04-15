'use client';

import { useState, useCallback } from 'react';
import { Plus, RefreshCw, ArrowLeft, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { trpc } from '../lib/trpc';
import { useFilters } from '../hooks/useFilters';
import { useScrapeStatus } from '../hooks/useScrapeStatus';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useScrapingLimit } from '../context/ScrapingLimitContext';
import { SummaryCards } from '../components/SummaryCards';
import { FilterBar } from '../components/FilterBar';
import { ReportTable } from '../components/ReportTable';
import { BrandTable } from '../components/BrandTable';
import { AddPostModal } from '../components/AddPostModal';
import { AddBrandModal } from '../components/AddBrandModal';
import { ExportButton } from '../components/ExportButton';
import type { ScrapeStatusEvent, PostWithMetrics, Brand } from '../types';

function defaultScrapeFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 180);
  return d.toISOString().slice(0, 10);
}

function defaultScrapeTo() {
  return new Date().toISOString().slice(0, 10);
}

export default function DashboardPage() {
  const [addOpen, setAddOpen]         = useState(false);
  const [storyOpen, setStoryOpen]     = useState(false);
  const [addBrandOpen, setAddBrandOpen] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [scrapeFrom, setScrapeFrom]   = useState(defaultScrapeFrom);
  const [scrapeTo, setScrapeTo]       = useState(defaultScrapeTo);
  const { filters, set, reset } = useFilters();
  const queryClient = useQueryClient();

  // ── Brand query ──────────────────────────────────────────────────────────────
  const brandsQuery = trpc.brands.list.useQuery(undefined, {
    refetchInterval: (query) =>
      query.state.data?.some(b => b.scrape_status === 'scraping') ? 3000 : false,
  });

  // ── Post query — pass brand_id when in drill-down mode ───────────────────────
  const effectiveFilters = selectedBrand
    ? { ...filters, brand_id: selectedBrand.id }
    : filters;

  const postsQuery = trpc.posts.list.useQuery(effectiveFilters, {
    refetchInterval: (query) =>
      query.state.data?.some(p => p.scrape_status === 'pending') ? 2000 : false,
  });
  const totalsQuery = trpc.reports.totals.useQuery(effectiveFilters);
  const campaignsQuery = trpc.reports.campaigns.useQuery();

  const triggerAll = trpc.scrape.triggerAll.useMutation({
    onSuccess: d => toast.success(`Queued ${d.batches} batch${d.batches !== 1 ? 'es' : ''} (${d.posts} posts)`),
    onError:   e => toast.error(e.message),
  });
  const triggerFailed = trpc.scrape.triggerFailed.useMutation({
    onSuccess: d => d.posts > 0 ? toast.success(`Retrying ${d.posts} failed post${d.posts !== 1 ? 's' : ''}`) : toast.info('No failed posts to retry'),
    onError:   e => toast.error(e.message),
  });

  const invalidatePostData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [['posts', 'list']] });
    queryClient.invalidateQueries({ queryKey: [['reports', 'totals']] });
  }, [queryClient]);

  const onScrapeEvent = useCallback((event: ScrapeStatusEvent) => {
    if (event.type === 'completed' || event.type === 'failed') {
      invalidatePostData();
    }
  }, [invalidatePostData]);

  const { scrapingPostIds } = useScrapeStatus(onScrapeEvent);
  const { disabled: scrapingDisabled } = useScrapingLimit();

  const handleAddPost   = useCallback(() => setAddOpen(true), []);
  const handleScrapeAll = useCallback(() => triggerAll.mutate(), [triggerAll]);

  useKeyboardShortcuts({
    onAddPost:   handleAddPost,
    onScrapeAll: handleScrapeAll,
  });

  function handleRefetch() {
    invalidatePostData();
  }

  function handleBrandRefetch() {
    queryClient.invalidateQueries({ queryKey: [['brands', 'list']] });
    invalidatePostData();
  }

  function handleViewBrandDetails(brand: Brand) {
    setSelectedBrand(brand);
    reset(); // clear any existing filters when drilling into a brand
  }

  function handleBackToAll() {
    setSelectedBrand(null);
  }

  return (
    <div className="space-y-5">
      {/* Summary */}
      <SummaryCards totals={totalsQuery.data} isLoading={totalsQuery.isLoading} isError={totalsQuery.isError} />

      {/* ── Brand Table (Table 1) ─────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-700">Brands</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Scrape range:</span>
            <input
              type="date"
              value={scrapeFrom}
              onChange={e => setScrapeFrom(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-300"
              title="Scrape posts from this date"
            />
            <span className="text-xs text-gray-400">to</span>
            <input
              type="date"
              value={scrapeTo}
              onChange={e => setScrapeTo(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-300"
              title="Scrape posts up to this date"
            />
            <button
              onClick={() => setAddBrandOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100 transition-colors"
            >
              <Building2 size={14} />
              + Add Brand
            </button>
          </div>
        </div>
        {brandsQuery.isLoading ? (
          <div className="rounded-xl border border-gray-100 bg-white p-6 text-center text-sm text-gray-400 animate-pulse">
            Loading brands…
          </div>
        ) : brandsQuery.isError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-600">
            Failed to load brands: {brandsQuery.error?.message}
          </div>
        ) : (
          <BrandTable
            brands={(brandsQuery.data ?? []) as Brand[]}
            onViewDetails={handleViewBrandDetails}
            onRefetch={handleBrandRefetch}
          />
        )}
      </div>

      {/* ── Post Table (Table 2) ──────────────────────────────────────────── */}
      <div>
        {/* Drill-down breadcrumb */}
        {selectedBrand ? (
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={handleBackToAll}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-500 hover:border-gray-300 hover:text-gray-700 transition-colors"
            >
              <ArrowLeft size={14} />
              All Posts
            </button>
            <span className="text-gray-300">/</span>
            <span className="text-sm font-semibold text-gray-800">{selectedBrand.name}</span>
            <span className="text-xs text-gray-400">({selectedBrand.platform})</span>
          </div>
        ) : (
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Posts</h2>
        )}

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <FilterBar
            filters={filters}
            campaigns={campaignsQuery.data ?? []}
            onChange={set}
            onReset={reset}
          />

          <div className="flex items-center gap-2">
            <ExportButton filters={effectiveFilters} />

            {(postsQuery.data ?? []).some(p => p.scrape_status === 'failed') && (
              <button
                onClick={() => triggerFailed.mutate()}
                disabled={triggerFailed.isPending || scrapingDisabled}
                title={scrapingDisabled ? 'Scraping paused — usage limit exceeded' : 'Retry all failed posts'}
                className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RefreshCw size={14} className={triggerFailed.isPending ? 'animate-spin' : ''} />
                Retry Failed
              </button>
            )}

            <button
              onClick={() => triggerAll.mutate()}
              disabled={triggerAll.isPending || scrapingDisabled}
              title={scrapingDisabled ? 'Scraping paused — usage limit exceeded' : 'Scrape all due posts (Ctrl+R)'}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:border-brand-400 hover:text-brand-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RefreshCw size={14} className={triggerAll.isPending ? 'animate-spin' : ''} />
              Scrape All
            </button>

            <button
              onClick={() => setStoryOpen(true)}
              title="Add Instagram Story"
              className="flex items-center gap-1.5 rounded-lg border border-pink-200 bg-pink-50 px-3 py-1.5 text-sm font-medium text-pink-700 hover:bg-pink-100 transition-colors"
            >
              <Plus size={14} />
              Add Story
            </button>

            <button
              onClick={() => setAddOpen(true)}
              title="Add post (Ctrl+N)"
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
            >
              <Plus size={14} />
              Add Post
            </button>
          </div>
        </div>

        {/* Post Table */}
        {postsQuery.isLoading ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400 animate-pulse">
            Loading posts…
          </div>
        ) : postsQuery.isError ? (
          <div className="bg-red-50 rounded-xl border border-red-200 p-8 text-center text-sm text-red-600">
            Failed to load posts: {postsQuery.error?.message}
          </div>
        ) : (
          <ReportTable
            posts={(postsQuery.data ?? []) as PostWithMetrics[]}
            totals={totalsQuery.data}
            scrapingPostIds={scrapingPostIds}
            onRefetch={handleRefetch}
            brandId={selectedBrand?.id}
            brandName={selectedBrand?.name}
            onTagFilter={tag => set('tags', tag)}
          />
        )}
      </div>

      <AddPostModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={handleRefetch}
      />

      <AddPostModal
        open={storyOpen}
        onClose={() => setStoryOpen(false)}
        onSuccess={handleRefetch}
        defaultPlatform="Instagram"
        defaultFormat="Story"
        lockPlatformFormat
      />

      <AddBrandModal
        open={addBrandOpen}
        onClose={() => setAddBrandOpen(false)}
        onSuccess={handleBrandRefetch}
        fromDate={scrapeFrom}
        toDate={scrapeTo}
      />
    </div>
  );
}
