'use client';

import * as Select from '@radix-ui/react-select';
import { ChevronDown, X, Tag } from 'lucide-react';
import type { Filters } from '../types';

const PLATFORMS = ['Instagram', 'Facebook', 'Twitter', 'LinkedIn', 'YouTube'];
const FORMATS   = ['Static', 'Carousel', 'Gif', 'Reel', 'Video Post', 'Story', 'Article'];
const BUCKETS   = ['Brand', 'Offerings', 'Consumer', 'Topical', 'Moment'];

interface Props {
  filters: Filters;
  campaigns: string[];
  onChange: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  onReset: () => void;
}

function FilterSelect({
  label, value, options, onValueChange,
}: {
  label: string;
  value?: string;
  options: string[];
  onValueChange: (v: string) => void;
}) {
  return (
    <Select.Root value={value ?? '__all__'} onValueChange={v => onValueChange(v === '__all__' ? '' : v)}>
      <Select.Trigger className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-300 min-w-[130px]">
        <Select.Value placeholder={label} />
        <ChevronDown size={14} className="ml-auto text-gray-400" />
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="z-50 bg-white rounded-lg border border-gray-200 shadow-lg overflow-hidden">
          <Select.Viewport className="p-1">
            <Select.Item value="__all__" className="flex items-center px-2 py-1.5 text-sm text-gray-500 cursor-pointer rounded hover:bg-gray-50 focus:outline-none focus:bg-gray-100">
              <Select.ItemText>All {label}s</Select.ItemText>
            </Select.Item>
            {options.map(opt => (
              <Select.Item key={opt} value={opt} className="flex items-center px-2 py-1.5 text-sm text-gray-700 cursor-pointer rounded hover:bg-brand-50 focus:outline-none focus:bg-brand-50">
                <Select.ItemText>{opt}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

export function FilterBar({ filters, campaigns, onChange, onReset }: Props) {
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterSelect
        label="Platform"
        value={filters.platform}
        options={PLATFORMS}
        onValueChange={v => onChange('platform', v || undefined)}
      />
      <FilterSelect
        label="Format"
        value={filters.format}
        options={FORMATS}
        onValueChange={v => onChange('format', v || undefined)}
      />
      <FilterSelect
        label="Bucket"
        value={filters.content_bucket}
        options={BUCKETS}
        onValueChange={v => onChange('content_bucket', v || undefined)}
      />
      <FilterSelect
        label="Campaign"
        value={filters.campaign}
        options={campaigns}
        onValueChange={v => onChange('campaign', v || undefined)}
      />
      <input
        type="date"
        value={filters.date_from ?? ''}
        onChange={e => onChange('date_from', e.target.value || undefined)}
        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-300"
        title="From date"
        placeholder="From"
      />
      <input
        type="date"
        value={filters.date_to ?? ''}
        onChange={e => onChange('date_to', e.target.value || undefined)}
        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-300"
        title="To date"
        placeholder="To"
      />
      {/* Tagged filter — only relevant when brand_id is set or user wants to see across brands */}
      <Select.Root
        value={filters.tagged === true ? 'tagged' : filters.tagged === false ? 'non_tagged' : '__all__'}
        onValueChange={v => {
          if (v === 'tagged')     onChange('tagged', true);
          else if (v === 'non_tagged') onChange('tagged', false);
          else onChange('tagged', undefined);
        }}
      >
        <Select.Trigger className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-300 min-w-[130px]">
          <Select.Value placeholder="Tagged Status" />
          <ChevronDown size={14} className="ml-auto text-gray-400" />
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className="z-50 bg-white rounded-lg border border-gray-200 shadow-lg overflow-hidden">
            <Select.Viewport className="p-1">
              <Select.Item value="__all__" className="flex items-center px-2 py-1.5 text-sm text-gray-500 cursor-pointer rounded hover:bg-gray-50 focus:outline-none focus:bg-gray-100">
                <Select.ItemText>All Tagged Status</Select.ItemText>
              </Select.Item>
              <Select.Item value="tagged" className="flex items-center px-2 py-1.5 text-sm text-gray-700 cursor-pointer rounded hover:bg-brand-50 focus:outline-none focus:bg-brand-50">
                <Select.ItemText>Tagged</Select.ItemText>
              </Select.Item>
              <Select.Item value="non_tagged" className="flex items-center px-2 py-1.5 text-sm text-gray-700 cursor-pointer rounded hover:bg-brand-50 focus:outline-none focus:bg-brand-50">
                <Select.ItemText>Non-tagged</Select.ItemText>
              </Select.Item>
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
      {filters.tags && (
        <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
          <Tag size={11} />
          {filters.tags}
          <button
            onClick={() => onChange('tags', undefined)}
            className="ml-0.5 hover:text-red-500 transition-colors"
            title="Clear tag filter"
          >
            <X size={11} />
          </button>
        </span>
      )}
      {hasFilters && (
        <button
          onClick={onReset}
          className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-500 hover:border-red-300 hover:text-red-500 transition-colors"
        >
          <X size={14} />
          Clear
        </button>
      )}
    </div>
  );
}
