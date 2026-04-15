'use client';

import { motion } from 'framer-motion';
import { Users, TrendingUp, Eye, Heart, Info } from 'lucide-react';
import { ACCOUNT_COLORS } from './HandleInput';
import { fmtNum, fmtPct } from '../../utils/formatters';
import { Tooltip } from '../Tooltip';

interface AccountResult {
  label: string;
  handle: string;
  is_self: boolean;
  followers: number | null;
  avg_likes: number | null;
  avg_comments: number | null;
  avg_views: number | null;
  avg_engagement: number | null;
  avg_engagement_rate: number | null;
  status: string;
}

interface Props {
  accounts: AccountResult[];
}

interface KPIDef {
  key: keyof AccountResult;
  label: string;
  icon: React.ElementType;
  formatter: (v: number) => string;
  tooltip: string;
}

const KPIS: KPIDef[] = [
  {
    key: 'followers',
    label: 'Followers',
    icon: Users,
    formatter: fmtNum,
    tooltip: 'Total follower count scraped from the account profile.',
  },
  {
    key: 'avg_engagement_rate',
    label: 'Avg. Eng. Rate',
    icon: TrendingUp,
    formatter: v => fmtPct(v, 2),
    tooltip: 'Formula: (Likes + Comments) ÷ Followers\nAveraged across all scraped posts.\nShows how engaged the audience is relative to its size.',
  },
  {
    key: 'avg_engagement',
    label: 'Avg. Engagement',
    icon: Heart,
    formatter: fmtNum,
    tooltip: 'Formula: Likes + Comments per post\nAveraged across all scraped posts.\nAbsolute engagement volume regardless of follower count.',
  },
  {
    key: 'avg_views',
    label: 'Avg. Views',
    icon: Eye,
    formatter: fmtNum,
    tooltip: 'Instagram: average video/reel play count.\nLinkedIn: not available (impressions are not exposed without OAuth).\nShown as — when no video posts exist.',
  },
  {
    key: 'avg_likes',
    label: 'Avg. Likes',
    icon: Heart,
    formatter: fmtNum,
    tooltip: 'Average reactions per post.\nIncludes all reaction types (Like, Love, Celebrate, etc. on LinkedIn).\nAveraged across all scraped posts.',
  },
  {
    key: 'avg_comments',
    label: 'Avg. Comments',
    icon: TrendingUp,
    formatter: fmtNum,
    tooltip: 'Average comment count per post.\nAveraged across all scraped posts.',
  },
];

// Show just the slug for LinkedIn URLs, @handle for Instagram
function displayHandle(handle: string): string {
  if (handle.toLowerCase().includes('linkedin.com/')) {
    const parts = handle.replace(/^https?:\/\//i, '').split('/').filter(Boolean);
    return parts[parts.length - 1] ?? handle;
  }
  return `@${handle}`;
}

function val(v: unknown): number | null {
  if (typeof v === 'number') return v;
  return null;
}

export function KPICompareGrid({ accounts }: Props) {
  return (
    <div className="space-y-4">
      {KPIS.map(kpi => {
        const Icon = kpi.icon;
        const values = accounts.map(a => val(a[kpi.key]));
        const maxVal = Math.max(...values.filter(v => v != null) as number[], 0);

        return (
          <motion.div
            key={String(kpi.key)}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"
          >
            <div className="flex items-center gap-2 mb-4">
              <Icon size={14} className="text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-700">{kpi.label}</h3>
              <Tooltip content={kpi.tooltip}>
                <Info size={12} className="text-gray-300 hover:text-indigo-400 transition-colors" />
              </Tooltip>
            </div>

            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${accounts.length}, minmax(0, 1fr))` }}>
              {accounts.map((a, i) => {
                const v = val(a[kpi.key]);
                const pct = maxVal > 0 && v != null ? (v / maxVal) * 100 : 0;
                const color = ACCOUNT_COLORS[i % ACCOUNT_COLORS.length];
                const rawValue = v != null
                  ? (kpi.key === 'avg_engagement_rate'
                      ? `${(v * 100).toFixed(4)}%`
                      : v.toLocaleString(undefined, { maximumFractionDigits: 2 }))
                  : null;

                return (
                  <div key={a.handle} className="flex flex-col items-center gap-2">
                    {/* Bar with tooltip showing raw value */}
                    <Tooltip
                      content={rawValue
                        ? `${a.label}: ${rawValue}${kpi.key === 'avg_engagement_rate' ? '\n(Likes + Comments) ÷ Followers' : ''}`
                        : `${a.label}: No data`}
                      position="top"
                      className="w-full"
                    >
                      <div className="w-full h-24 bg-gray-50 rounded-xl flex items-end overflow-hidden relative">
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: `${pct}%` }}
                          transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
                          className="w-full rounded-t-lg"
                          style={{ backgroundColor: color, opacity: 0.85 }}
                        />
                      </div>
                    </Tooltip>

                    {/* Value */}
                    <Tooltip
                      content={rawValue ? `Exact: ${rawValue}` : 'No data available'}
                      position="bottom"
                    >
                      <span className="text-sm font-bold text-gray-900">
                        {v != null ? kpi.formatter(v) : '—'}
                      </span>
                    </Tooltip>

                    {/* Label */}
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                        <span className="text-xs font-medium text-gray-700">{a.label}</span>
                      </div>
                      <Tooltip content={a.handle} position="bottom">
                        <span className="text-[10px] text-gray-400">{displayHandle(a.handle)}</span>
                      </Tooltip>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
