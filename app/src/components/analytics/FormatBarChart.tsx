'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { monthLabel } from '../../utils/formatters';

export const FORMAT_COLORS: Record<string, string> = {
  Static:      '#6366f1',
  Carousel:    '#14b8a6',
  Reel:        '#f59e0b',
  Story:       '#ec4899',
  'Video Post':'#22c55e',
  Gif:         '#f97316',
  Article:     '#8b5cf6',
};

const ALL_FORMATS = ['Static', 'Carousel', 'Reel', 'Story', 'Video Post', 'Gif', 'Article'];

interface FormatDeliveredRow {
  month: string;
  format: string;
  post_count: number;
}

interface Props {
  data: FormatDeliveredRow[];
  height?: number;
}

function buildChartData(data: FormatDeliveredRow[]) {
  const months = [...new Set(data.map(d => d.month))].sort();
  const formats = [...new Set(data.map(d => d.format))];

  return months.map(month => {
    const row: Record<string, unknown> = { month };
    for (const f of formats) {
      const found = data.find(d => d.month === month && d.format === f);
      row[f] = found?.post_count ?? 0;
    }
    return row;
  });
}

function formatMonth(val: string) {
  try { return monthLabel(`${val}-01`); } catch { return val; }
}

export function FormatBarChart({ data, height = 220 }: Props) {
  const formats = [...new Set(data.map(d => d.format))];
  const chartData = buildChartData(data);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="month"
          tickFormatter={formatMonth}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          width={32}
          allowDecimals={false}
        />
        <Tooltip
          labelFormatter={formatMonth}
          contentStyle={{
            borderRadius: 10,
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.07)',
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
        {formats.map(f => (
          <Bar
            key={f}
            dataKey={f}
            stackId="a"
            fill={FORMAT_COLORS[f] ?? '#94a3b8'}
            radius={formats.indexOf(f) === formats.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
            maxBarSize={48}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
