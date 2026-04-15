'use client';

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { ACCOUNT_COLORS } from './HandleInput';

interface Post {
  published_at: string | null;
  engagement: number;
  engagement_rate: number | null;
  likes: number;
  views: number | null;
}

interface AccountPosts {
  label: string;
  handle: string;
  posts: Post[];
}

interface Props {
  accounts: AccountPosts[];
  metric?: 'engagement' | 'engagement_rate' | 'likes' | 'views';
  height?: number;
}

const numFmt = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(1)}K` : `${v}`;

const pctFmt = (v: number) => `${(v * 100).toFixed(2)}%`;

// Group posts by month (YYYY-MM) and average the metric per account
function buildChartData(accounts: AccountPosts[], metric: string): Record<string, unknown>[] {
  // Collect all months across all accounts
  const monthSet = new Set<string>();
  for (const a of accounts) {
    for (const p of a.posts) {
      if (p.published_at) {
        monthSet.add(p.published_at.slice(0, 7)); // "YYYY-MM"
      }
    }
  }

  const months = Array.from(monthSet).sort(); // ascending
  return months.map(month => {
    const row: Record<string, unknown> = { month };
    for (const a of accounts) {
      const values = a.posts
        .filter(p => p.published_at?.startsWith(month))
        .map(p => (p[metric as keyof Post] as number | null) ?? null)
        .filter((v): v is number => v !== null);
      row[a.label] = values.length > 0
        ? values.reduce((s, v) => s + v, 0) / values.length
        : null;
    }
    return row;
  });
}

function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-GB', { month: 'short', year: '2-digit' });
}

export function EngagementTrend({ accounts, metric = 'engagement', height = 280 }: Props) {
  const data = buildChartData(accounts, metric);
  const isPct = metric === 'engagement_rate';
  const formatter = isPct ? pctFmt : numFmt;
  const metricLabel: Record<string, string> = {
    engagement: 'Engagement',
    engagement_rate: 'Eng. Rate',
    likes: 'Likes',
    views: 'Views',
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="month"
          tickFormatter={fmtMonth}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={formatter}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          width={52}
        />
        <Tooltip
          formatter={(v: number, name: string) => [formatter(v), name]}
          labelFormatter={(label: string) => fmtMonth(label)}
          contentStyle={{
            borderRadius: 10,
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.07)',
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
        {accounts.map((a, i) => (
          <Line
            key={a.label}
            type="monotone"
            dataKey={a.label}
            stroke={ACCOUNT_COLORS[i % ACCOUNT_COLORS.length]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            connectNulls={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
