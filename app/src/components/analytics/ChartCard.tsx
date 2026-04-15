'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: string;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  emptyIcon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function ChartCard({
  title,
  subtitle,
  isLoading,
  isEmpty,
  emptyMessage = 'No data available for the selected period.',
  emptyIcon,
  actions,
  children,
  className = '',
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 print:shadow-none print:border-gray-200 ${className}`}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
          <div className="h-48 bg-gray-100 rounded-xl animate-pulse" />
          <div className="h-3 bg-gray-100 rounded animate-pulse w-1/2" />
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          {emptyIcon && <div className="mb-3 text-gray-300">{emptyIcon}</div>}
          <p className="text-sm text-gray-400 max-w-xs">{emptyMessage}</p>
        </div>
      ) : (
        children
      )}
    </motion.div>
  );
}
