'use client';

import { ExternalLink } from 'lucide-react';
import type { PostWithMetrics } from '../../types';
import { fmtNum, fmtPct } from '../../utils/formatters';

interface Props {
  post: PostWithMetrics;
  rank: number;
  variant?: 'top' | 'bottom';
}

const FORMAT_BADGE_COLOR: Record<string, string> = {
  Static:      'bg-indigo-100 text-indigo-700',
  Carousel:    'bg-teal-100 text-teal-700',
  Reel:        'bg-amber-100 text-amber-700',
  Story:       'bg-pink-100 text-pink-700',
  'Video Post':'bg-green-100 text-green-700',
  Gif:         'bg-orange-100 text-orange-700',
  Article:     'bg-violet-100 text-violet-700',
};

function getDomain(url: string) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
}

export function PostCard({ post, rank, variant = 'top' }: Props) {
  const m = post.metrics;
  const rankColor = variant === 'top' ? 'bg-indigo-600' : 'bg-slate-400';

  // Weighted engagement score: likes + comments×1.5 + shares×2 + saves×3
  // Normalized by uploader_followers when available (shown as %), raw count otherwise
  const weighted =
    (m?.likes ?? 0) +
    (m?.comments ?? 0) * 1.5 +
    (m?.shares ?? 0) * 2 +
    (m?.saves ?? 0) * 3;
  const hasFollowers = post.uploader_followers != null && post.uploader_followers > 0;
  const engScore = hasFollowers
    ? fmtPct(weighted / post.uploader_followers!, 2)
    : fmtNum(Math.round(weighted));
  const engLabel = hasFollowers ? 'Eng. Score' : 'Eng. (raw)';

  return (
    <div className="group flex gap-3 bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:border-indigo-200 hover:shadow-md transition-all duration-200">
      {/* Rank */}
      <div className={`shrink-0 w-7 h-7 rounded-lg ${rankColor} text-white text-xs font-bold flex items-center justify-center`}>
        {rank}
      </div>

      {/* Thumbnail placeholder */}
      <div className="shrink-0 w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden relative">
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${FORMAT_BADGE_COLOR[post.format] ?? 'bg-gray-100 text-gray-600'}`}>
          {post.format}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-xs text-gray-400 truncate">{getDomain(post.post_url)}</span>
          {post.content_bucket && (
            <span className="shrink-0 text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
              {post.content_bucket}
            </span>
          )}
          <a
            href={post.post_url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 ml-auto text-gray-300 hover:text-indigo-500 transition-colors"
          >
            <ExternalLink size={12} />
          </a>
        </div>

        {/* Metrics row */}
        <div className="flex flex-wrap gap-3">
          <Metric label="Likes" value={fmtNum(m?.likes ?? 0)} />
          <Metric label="Comments" value={fmtNum(m?.comments ?? 0)} />
          <Metric label="Views" value={fmtNum(m?.views ?? 0)} />
          <Metric
            label={engLabel}
            value={engScore}
            highlight={variant === 'top'}
          />
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-gray-400">{label}</p>
      <p className={`text-xs font-semibold ${highlight ? 'text-indigo-600' : 'text-gray-800'}`}>{value}</p>
    </div>
  );
}
