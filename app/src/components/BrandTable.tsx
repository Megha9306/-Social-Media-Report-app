'use client';

import { type ReactNode, useState } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { RefreshCw, Trash2, ExternalLink, ChevronRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '../lib/trpc';
import { useScrapingLimit } from '../context/ScrapingLimitContext';
import { fmtNum, fmtPct, fmtDateTime } from '../utils/formatters';
import type { Brand } from '../types';

interface Props {
  brands: Brand[];
  onViewDetails: (brand: Brand) => void;
  onRefetch: () => void;
}

const PLATFORM_COLORS: Record<string, string> = {
  Instagram: 'bg-pink-50 text-pink-700',
  Facebook:  'bg-blue-50 text-blue-700',
  LinkedIn:  'bg-sky-50 text-sky-700',
};

const BRAND_COLUMNS = [
  { key: 'brand', label: 'Brand', tip: 'Brand or profile name connected to this workspace.' },
  { key: 'platform', label: 'Platform', tip: 'Social platform linked for scraping.' },
  { key: 'handle', label: 'Handle', tip: 'Public account handle for this brand.' },
  { key: 'followers', label: 'Followers', tip: 'Latest follower count captured for this profile.' },
  { key: 'total_posts', label: 'Total Posts', tip: 'Total posts currently stored for this brand.' },
  { key: 'total_reach', label: 'Total Reach', tip: 'Sum of reach across tracked posts for this brand.' },
  { key: 'avg_eng_rate', label: 'Avg Eng Rate', tip: 'Average active engagement rate across tracked posts.' },
  { key: 'tagged', label: 'Tagged', tip: 'Posts where the brand is tagged/mentioned.' },
  { key: 'non_tagged', label: 'Non-Tagged', tip: 'Posts where the brand is not tagged/mentioned.' },
  { key: 'last_scraped', label: 'Last Scraped', tip: 'Most recent successful scrape time for this brand.' },
  { key: 'status', label: 'Status', tip: 'Current scrape lifecycle status for this brand.' },
  { key: 'actions', label: 'Actions', tip: 'Open details, re-scrape, or remove this brand.' },
] as const;

function Tip({
  children,
  tip,
  side = 'top',
}: {
  children: ReactNode;
  tip: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <span className="inline-flex items-center">{children}</span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-[240px] rounded-md bg-gray-900 px-2 py-1.5 text-xs text-white shadow-lg"
        >
          {tip}
          <Tooltip.Arrow className="fill-gray-900" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function StatusBadge({ status }: { status: Brand['scrape_status'] }) {
  const map = {
    idle:      'bg-gray-100 text-gray-500',
    scraping:  'bg-purple-100 text-purple-700',
    completed: 'bg-green-100 text-green-700',
    failed:    'bg-red-100 text-red-700',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${map[status]}`}>
      {status === 'scraping' && <Loader2 size={10} className="animate-spin" />}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export function BrandTable({ brands, onViewDetails, onRefetch }: Props) {
  const { disabled: scrapingDisabled } = useScrapingLimit();
  const [pendingScrapeId, setPendingScrapeId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const triggerScrape = trpc.brands.triggerScrape.useMutation({
    onMutate:   (vars) => setPendingScrapeId(vars.id),
    onSettled:  ()    => setPendingScrapeId(null),
    onSuccess:  ()    => { toast.success('Re-scraping started'); onRefetch(); },
    onError:    e     => toast.error(e.message),
  });

  const deleteBrand = trpc.brands.delete.useMutation({
    onMutate:  (vars) => setPendingDeleteId(vars.id),
    onSettled: ()     => setPendingDeleteId(null),
    onSuccess: ()     => { toast.success('Brand removed'); onRefetch(); },
    onError:   e      => toast.error(e.message),
  });

  function handleDelete(brand: Brand) {
    if (!confirm(`Remove "${brand.name}"? Its scraped posts will be unlinked but not deleted.`)) return;
    deleteBrand.mutate({ id: brand.id });
  }

  if (brands.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center">
        <p className="text-sm text-gray-400">No brands added yet. Click <span className="font-medium text-brand-600">+ Add Brand</span> to get started.</p>
      </div>
    );
  }

  return (
    <Tooltip.Provider delayDuration={300}>
      <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                {BRAND_COLUMNS.map(col => (
                  <th key={col.key} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                    <Tip tip={col.tip} side="bottom">
                      <span className="cursor-help border-b border-dashed border-gray-300">
                        {col.label}
                      </span>
                    </Tip>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {brands.map(brand => (
                <tr key={brand.id} className="hover:bg-gray-50/50 transition-colors group">
                {/* Brand name */}
                <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap max-w-[160px] truncate">
                  {brand.name}
                </td>

                {/* Platform */}
                <td className="px-4 py-3">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${PLATFORM_COLORS[brand.platform] ?? 'bg-gray-100 text-gray-600'}`}>
                    {brand.platform}
                  </span>
                </td>

                {/* Handle */}
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                  {brand.handle ? (
                    <a
                      href={brand.profile_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:text-brand-600 transition-colors"
                    >
                      @{brand.handle}
                      <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </a>
                  ) : '—'}
                </td>

                {/* Followers */}
                <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fmtNum(brand.followers)}</td>

                {/* Total Posts */}
                <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fmtNum(brand.total_posts)}</td>

                {/* Total Reach */}
                <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fmtNum(brand.total_reach)}</td>

                {/* Avg Eng Rate */}
                <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fmtPct(brand.avg_eng_rate)}</td>

                {/* Tagged */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1 text-green-700">
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    {fmtNum(brand.tagged_posts)}
                  </span>
                </td>

                {/* Non-Tagged */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1 text-gray-500">
                    <span className="h-2 w-2 rounded-full bg-gray-300" />
                    {fmtNum(brand.non_tagged_posts)}
                  </span>
                </td>

                {/* Last Scraped */}
                <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">
                  {fmtDateTime(brand.last_scraped)}
                </td>

                {/* Status */}
                <td className="px-4 py-3">
                  <StatusBadge status={brand.scrape_status} />
                </td>

                {/* Actions */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <Tip tip="Open this brand's posts and metrics view.">
                      <button
                        onClick={() => onViewDetails(brand)}
                        className="flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700 transition-colors whitespace-nowrap"
                      >
                        View Details
                        <ChevronRight size={12} />
                      </button>
                    </Tip>
                    <Tip tip={scrapingDisabled ? 'Scraping paused — usage limit exceeded' : 'Trigger a fresh scrape for this brand profile.'}>
                      <button
                        onClick={() => triggerScrape.mutate({ id: brand.id })}
                        disabled={brand.scrape_status === 'scraping' || pendingScrapeId === brand.id || scrapingDisabled}
                        title={scrapingDisabled ? 'Scraping paused — usage limit exceeded' : 'Re-scrape'}
                        className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:border-brand-300 hover:text-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <RefreshCw size={13} className={brand.scrape_status === 'scraping' ? 'animate-spin' : ''} />
                      </button>
                    </Tip>
                    <Tip tip="Remove this brand connection from the dashboard.">
                      <button
                        onClick={() => handleDelete(brand)}
                        disabled={pendingDeleteId === brand.id}
                        title="Remove brand"
                        className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:border-red-300 hover:text-red-500 disabled:opacity-40 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </Tip>
                  </div>
                </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Tooltip.Provider>
  );
}
