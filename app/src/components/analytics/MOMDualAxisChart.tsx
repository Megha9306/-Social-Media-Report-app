'use client';

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { monthLabel } from '../../utils/formatters';

interface Props {
  data: Record<string, unknown>[];
  barKey: string;
  barLabel: string;
  barColor?: string;
  lineKey: string;
  lineLabel: string;
  lineColor?: string;
  barFormatter?: (v: number) => string;
  lineFormatter?: (v: number) => string;
  height?: number;
  xKey?: string;
}

const numFmt = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(1)}K` : String(v);

const pctFmt = (v: number) => `${(v * 100).toFixed(2)}%`;

function formatMonth(val: string) {
  try { return monthLabel(`${val}-01`); } catch { return val; }
}

export function MOMDualAxisChart({
  data,
  barKey,
  barLabel,
  barColor = '#6366f1',
  lineKey,
  lineLabel,
  lineColor = '#14b8a6',
  barFormatter = numFmt,
  lineFormatter = pctFmt,
  height = 220,
  xKey = 'month',
}: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey={xKey}
          tickFormatter={formatMonth}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          yAxisId="left"
          tickFormatter={barFormatter}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          width={48}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tickFormatter={lineFormatter}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          width={52}
        />
        <Tooltip
          formatter={(value: number, name: string) => {
            if (name === barKey) return [barFormatter(value), barLabel];
            if (name === lineKey) return [lineFormatter(value), lineLabel];
            return [value, name];
          }}
          labelFormatter={formatMonth}
          contentStyle={{
            borderRadius: 10,
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.07)',
            fontSize: 12,
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          formatter={(value: string) => value === barKey ? barLabel : lineLabel}
        />
        <Bar
          yAxisId="left"
          dataKey={barKey}
          fill={barColor}
          fillOpacity={0.85}
          radius={[4, 4, 0, 0]}
          maxBarSize={40}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey={lineKey}
          stroke={lineColor}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
