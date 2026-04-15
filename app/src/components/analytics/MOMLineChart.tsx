'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import { monthLabel } from '../../utils/formatters';

export interface LineSeriesConfig {
  dataKey: string;
  label: string;
  color: string;
  formatter?: (v: number) => string;
}

interface Props {
  data: Record<string, unknown>[];
  series: LineSeriesConfig[];
  xKey?: string;
  height?: number;
  area?: boolean;
  yFormatter?: (v: number) => string;
}

const defaultFormatter = (v: number) =>
  v >= 1_000_000
    ? `${(v / 1_000_000).toFixed(1)}M`
    : v >= 1_000
    ? `${(v / 1_000).toFixed(1)}K`
    : String(v);

function formatMonth(val: string) {
  try {
    return monthLabel(`${val}-01`);
  } catch {
    return val;
  }
}

export function MOMLineChart({
  data,
  series,
  xKey = 'month',
  height = 220,
  area = false,
  yFormatter = defaultFormatter,
}: Props) {
  const ChartComponent = area ? AreaChart : LineChart;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ChartComponent data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          {series.map(s => (
            <linearGradient key={s.dataKey} id={`grad-${s.dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={s.color} stopOpacity={0.15} />
              <stop offset="95%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey={xKey}
          tickFormatter={formatMonth}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={yFormatter}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          width={48}
        />
        <Tooltip
          formatter={(value: number, name: string) => {
            const s = series.find(s => s.dataKey === name);
            const fmt = s?.formatter ?? yFormatter;
            return [fmt(value), s?.label ?? name];
          }}
          labelFormatter={formatMonth}
          contentStyle={{
            borderRadius: 10,
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.07)',
            fontSize: 12,
          }}
        />
        {series.length > 1 && (
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            formatter={(value: string) => series.find(s => s.dataKey === value)?.label ?? value}
          />
        )}
        {series.map(s =>
          area ? (
            <Area
              key={s.dataKey}
              type="monotone"
              dataKey={s.dataKey}
              stroke={s.color}
              strokeWidth={2}
              fill={`url(#grad-${s.dataKey})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          ) : (
            <Line
              key={s.dataKey}
              type="monotone"
              dataKey={s.dataKey}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          ),
        )}
      </ChartComponent>
    </ResponsiveContainer>
  );
}
