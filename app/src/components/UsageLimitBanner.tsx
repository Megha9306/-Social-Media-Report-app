'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useScrapingLimit } from '../context/ScrapingLimitContext';

export function UsageLimitBanner() {
  const { disabled, dismiss, dismissing } = useScrapingLimit();
  const [confirming, setConfirming] = useState(false);

  if (!disabled) return null;

  return (
    <div className="w-full bg-red-600 text-white px-4 py-2.5 text-sm flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 min-w-0">
        <AlertTriangle size={15} className="shrink-0" />
        <span>
          <strong>Apify monthly usage limit exceeded</strong> — all scraping is paused.
          Upgrade your plan at{' '}
          <a
            href="https://apify.com"
            target="_blank"
            rel="noreferrer"
            className="underline font-medium"
          >
            apify.com
          </a>{' '}
          or wait for the monthly reset, then dismiss this banner to re-enable scraping.
        </span>
      </div>

      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="shrink-0 rounded border border-white/40 bg-white/10 px-3 py-1 text-xs font-medium hover:bg-white/20 transition-colors"
        >
          Dismiss
        </button>
      ) : (
        <span className="shrink-0 flex items-center gap-2 text-xs">
          <span className="opacity-90 whitespace-nowrap">Re-enable scraping?</span>
          <button
            onClick={() => { dismiss(); setConfirming(false); }}
            disabled={dismissing}
            className="rounded border border-white/40 bg-white/10 px-2.5 py-1 font-medium hover:bg-white/25 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {dismissing ? 'Clearing…' : 'Yes, dismiss'}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="rounded border border-white/30 bg-transparent px-2.5 py-1 hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
        </span>
      )}
    </div>
  );
}
