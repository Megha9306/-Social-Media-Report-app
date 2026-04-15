'use client';

import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import type { MetricsSnapshot } from '../types';

type Field = 'likes' | 'comments' | 'views' | 'reach' | 'active_eng' | 'passive_eng_rate';

interface Props {
  snapshots: MetricsSnapshot[];
  field?: Field;
}

function getValue(s: MetricsSnapshot, field: Field): number {
  if (field === 'passive_eng_rate') {
    const reach = s.reach ?? 0;
    if (reach === 0) return 0;
    const active = (s.likes ?? 0) + (s.comments ?? 0) + (s.shares ?? 0) + (s.saves ?? 0);
    const passive = s.views ?? 0;
    return (active + passive) / reach;
  }
  return (s[field] as number | null) ?? 0;
}

export function Sparkline({ snapshots, field = 'passive_eng_rate' }: Props) {
  if (!snapshots || snapshots.length < 2) {
    return <span className="text-gray-400 text-xs">—</span>;
  }

  const data = snapshots.map(s => ({ v: getValue(s, field) }));
  const label = field === 'passive_eng_rate' ? 'Passive Eng Rate' : field;

  return (
    <div className="w-20 h-8">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="v"
            stroke="#8b5cf6"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
          <Tooltip
            contentStyle={{ fontSize: 11, padding: '2px 6px' }}
            formatter={(v: number) => [field === 'passive_eng_rate' ? (v * 100).toFixed(1) + '%' : v, label]}
            labelFormatter={() => ''}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
