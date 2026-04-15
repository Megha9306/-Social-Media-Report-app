'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';
import { ACCOUNT_COLORS } from './HandleInput';

interface AccountResult {
  label: string;
  handle: string;
  followers: number | null;
  avg_likes: number | null;
  avg_comments: number | null;
  avg_views: number | null;
  avg_engagement: number | null;
  avg_engagement_rate: number | null;
}

interface Props {
  accounts: AccountResult[];
  metric: keyof AccountResult;
  title: string;
  formatter?: (v: number) => string;
  height?: number;
}

const numFmt = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(1)}K` : `${v}`;

export function CompareBarChart({ accounts, metric, title, formatter = numFmt, height = 220 }: Props) {
  const data = accounts.map((a, i) => ({
    name: a.label,
    value: typeof a[metric] === 'number' ? (a[metric] as number) : 0,
    color: ACCOUNT_COLORS[i % ACCOUNT_COLORS.length],
    handle: a.handle,
  }));

  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-3">{title}</p>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: '#64748b' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={formatter}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip
            formatter={(v: number) => [formatter(v), title]}
            labelFormatter={(label: string, payload) => {
              const item = payload?.[0]?.payload;
              return item ? `${label} (@${item.handle})` : label;
            }}
            contentStyle={{
              borderRadius: 10,
              border: '1px solid #e2e8f0',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.07)',
              fontSize: 12,
            }}
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={60}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
