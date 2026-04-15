'use client';

import { CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react';
import { ACCOUNT_COLORS } from './HandleInput';

interface AccountProgress {
  accountRunId: string;
  label: string;
  handle: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error: string | null;
}

interface Props {
  progress: AccountProgress[];
  overallStatus: string;
}

const STATUS_ICON = {
  pending:   <Clock size={14} className="text-gray-400" />,
  running:   <Loader2 size={14} className="text-indigo-500 animate-spin" />,
  completed: <CheckCircle2 size={14} className="text-green-500" />,
  failed:    <XCircle size={14} className="text-red-400" />,
};

const STATUS_LABEL = {
  pending:   'Queued',
  running:   'Scraping…',
  completed: 'Done',
  failed:    'Failed',
};

export function RunProgress({ progress, overallStatus }: Props) {
  const done = progress.filter(p => p.status === 'completed' || p.status === 'failed').length;
  const total = progress.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const isFailed = overallStatus === 'failed';
  const isPartial = overallStatus === 'partial';

  const title = isFailed
    ? 'Scraping failed'
    : isPartial
    ? 'Scraping partially completed'
    : done === total && total > 0
    ? 'Scraping complete'
    : 'Scraping in progress…';

  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-5 space-y-4 ${isFailed ? 'border-red-100' : 'border-gray-100'}`}>
      <div className="flex items-center justify-between">
        <h3 className={`text-sm font-semibold ${isFailed ? 'text-red-600' : 'text-gray-800'}`}>{title}</h3>
        <span className="text-xs text-gray-400">{done} / {total} accounts</span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isFailed ? 'bg-red-400' : isPartial ? 'bg-amber-400' : 'bg-indigo-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Per-account status */}
      <div className="space-y-3">
        {progress.map((p, i) => (
          <div key={p.accountRunId}>
            <div className="flex items-center gap-3">
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: ACCOUNT_COLORS[i % ACCOUNT_COLORS.length] }}
              />
              <span className="text-sm font-medium text-gray-700 w-16 shrink-0">{p.label}</span>
              <span className="text-xs text-gray-400 flex-1 truncate">@{p.handle}</span>
              <div className="flex items-center gap-1.5">
                {STATUS_ICON[p.status]}
                <span className="text-xs text-gray-500">{STATUS_LABEL[p.status]}</span>
              </div>
            </div>
            {p.status === 'failed' && p.error && (
              <p className="ml-5 mt-1 text-xs text-red-500 break-words">{p.error}</p>
            )}
          </div>
        ))}
      </div>

      {isFailed && (
        <p className="text-xs text-red-500 pt-1">All accounts failed to scrape. Check the errors above and try again.</p>
      )}
    </div>
  );
}
