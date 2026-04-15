'use client';

import * as Tooltip from '@radix-ui/react-tooltip';
import { CheckCircle, Clock, AlertCircle, XCircle, Loader2 } from 'lucide-react';
import type { ScrapeStatus } from '../types';
import { fmtDateTime, isStale } from '../utils/formatters';

interface Props {
  status: ScrapeStatus;
  scrapedAt?: string | null;
  lastError?: string | null;
  isLive?: boolean; // currently being scraped
}

export function StatusBadge({ status, scrapedAt, lastError, isLive }: Props) {
  if (isLive || status === 'pending') {
    return (
      <span className="flex items-center gap-1 text-brand-500 text-xs font-medium">
        <Loader2 size={12} className="animate-spin" />
        in-progress
      </span>
    );
  }

  const stale = isStale(scrapedAt);

  if (status === 'success') {
    return (
      <Tooltip.Provider>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <span className={`flex items-center gap-1 text-xs font-medium ${stale ? 'text-amber-500' : 'text-emerald-500'}`}>
              {stale ? <Clock size={12} /> : <CheckCircle size={12} />}
              <span className="flex flex-col leading-tight">
                <span>scraped</span>
                <span className="font-normal opacity-70">{fmtDateTime(scrapedAt)}</span>
              </span>
            </span>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content className="bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg">
              {stale ? 'Data may be stale (>24h)' : 'Scraped recently'}
              <Tooltip.Arrow className="fill-gray-900" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
    );
  }

  if (status === 'failed') {
    return (
      <Tooltip.Provider>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <span className="flex items-center gap-1 text-red-500 text-xs font-medium cursor-help">
              <AlertCircle size={12} />
              failed
            </span>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content className="bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg max-w-xs">
              {lastError ?? 'Unknown error'}
              <Tooltip.Arrow className="fill-gray-900" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
    );
  }

  if (status === 'post_deleted') {
    return (
      <span className="flex items-center gap-1 text-gray-400 text-xs font-medium">
        <XCircle size={12} />
        deleted
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1 text-gray-400 text-xs font-medium">
      <Clock size={12} />
      pending
    </span>
  );
}
