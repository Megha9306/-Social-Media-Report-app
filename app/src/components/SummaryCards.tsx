'use client';

import { TrendingUp, Users, Zap, RefreshCw } from 'lucide-react';
import type { ReportTotals } from '../types';
import { fmtNum, fmtPct } from '../utils/formatters';

interface Props {
  totals: ReportTotals | undefined;
  isLoading?: boolean;
  isError?: boolean;
}

function Card({
  label, value, icon: Icon, color,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-4">
      <div className={`rounded-lg p-2.5 ${color}`}>
        <Icon size={20} className="text-white" />
      </div>
      <div>
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className="text-xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

export function SummaryCards({ totals, isLoading, isError }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0,1,2,3].map(i => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 h-20 animate-pulse bg-gray-50" />
        ))}
      </div>
    );
  }

  if (isError || !totals) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card label="Total Posts" value="--" icon={TrendingUp} color="bg-brand-600" />
        <Card label="Total Reach" value="--" icon={Users} color="bg-blue-600" />
        <Card label="Avg Eng. Rate" value="--" icon={Zap} color="bg-emerald-600" />
        <Card label="Scraped Today" value="--" icon={RefreshCw} color="bg-amber-500" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card label="Total Posts"       value={fmtNum(totals.totalPosts)}    icon={TrendingUp} color="bg-brand-600" />
      <Card label="Total Reach"       value={fmtNum(totals.totalReach)}    icon={Users}      color="bg-blue-600" />
      <Card label="Avg Eng. Rate"     value={fmtPct(totals.avgEngRate, 2)} icon={Zap}        color="bg-emerald-600" />
      <Card label="Scraped Today"     value={fmtNum(totals.scrapedToday)}  icon={RefreshCw}  color="bg-amber-500" />
    </div>
  );
}
