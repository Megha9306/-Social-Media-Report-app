'use client';

import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { MetricsSnapshot } from '../types';

interface Props {
  snapshots: MetricsSnapshot[];
  height?: number;
  title?: string;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtMonth(iso: string): string {
  const d = new Date(iso);
  return `${MONTH_LABELS[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
}

function fmtNum(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

export function PostTrendChart({
  snapshots,
  height = 90,
  title = 'Views - monthly trend',
}: Props) {
  const data = snapshots.map((s) => ({
    month: fmtMonth(s.scraped_at),
    views: s.views ?? 0,
  }));

  if (data.length < 2) {
    return (
      <p className="py-3 text-center text-xs text-gray-400">
        Not enough snapshots yet - trend will appear after multiple end-of-month scrapes
      </p>
    );
  }

  return (
    <div className="w-full py-2">
      <p className="mb-2 text-xs font-medium text-gray-500">{title}</p>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="month"
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={fmtNum}
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <Tooltip
            formatter={(v: number) => [fmtNum(v), 'Views']}
            contentStyle={{
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              fontSize: 11,
              boxShadow: '0 2px 4px rgb(0 0 0 / 0.06)',
            }}
          />
          <Area
            type="monotone"
            dataKey="views"
            stroke="#6366f1"
            strokeWidth={2}
            fill="url(#trendGradient)"
            dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
