'use client';

import { Plus, X, User } from 'lucide-react';

export interface HandleEntry {
  label:    string;
  handle:   string;
  is_self:  boolean;
  platform: 'instagram' | 'linkedin' | 'twitter' | 'facebook' | 'youtube';
}

interface Props {
  entries: HandleEntry[];
  onChange: (entries: HandleEntry[]) => void;
}

// Account color chips (consistent with chart colors)
export const ACCOUNT_COLORS = [
  '#8b5cf6', // Me — violet
  '#6366f1', // Comp 1 — indigo
  '#14b8a6', // Comp 2 — teal
  '#f59e0b', // Comp 3 — amber
  '#ec4899', // Comp 4 — pink
  '#22c55e', // Comp 5 — green
  '#f97316', // Comp 6 — orange
  '#06b6d4', // Comp 7 — cyan
];

export function detectPlatform(raw: string): HandleEntry['platform'] {
  const h = raw.trim().toLowerCase().replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  if (h.startsWith('linkedin.com/'))               return 'linkedin';
  if (h.startsWith('twitter.com/') || h.startsWith('x.com/')) return 'twitter';
  if (h.startsWith('facebook.com/'))               return 'facebook';
  if (h.startsWith('youtube.com/') || h.startsWith('youtu.be/')) return 'youtube';
  return 'instagram';
}

const BADGE_CONFIG: Record<HandleEntry['platform'], { label: string; className: string }> = {
  instagram: { label: 'IG', className: 'bg-pink-500 text-white' },
  linkedin:  { label: 'LI', className: 'bg-blue-600 text-white' },
  twitter:   { label: 'TW', className: 'bg-blue-400 text-white' },
  facebook:  { label: 'FB', className: 'bg-blue-700 text-white' },
  youtube:   { label: 'YT', className: 'bg-red-600 text-white' },
};

function PlatformBadge({ platform }: { platform: HandleEntry['platform'] }) {
  const { label, className } = BADGE_CONFIG[platform];
  return (
    <span className={`shrink-0 inline-flex items-center justify-center w-6 h-6 rounded text-[10px] font-bold select-none ${className}`}>
      {label}
    </span>
  );
}

export function HandleInput({ entries, onChange }: Props) {
  function updateEntry(i: number, field: keyof HandleEntry, value: string | boolean) {
    const next = [...entries];
    (next[i] as unknown as Record<string, unknown>)[field] = value;
    onChange(next);
  }

  function handleHandleChange(i: number, raw: string) {
    const next = [...entries];
    const value = raw.replace(/^@/, '');
    next[i] = { ...next[i], handle: value, platform: detectPlatform(value) };
    onChange(next);
  }

  function addCompetitor() {
    const compNum = entries.filter(e => !e.is_self).length + 1;
    onChange([...entries, { label: `Comp ${compNum}`, handle: '', is_self: false, platform: 'instagram' }]);
  }

  function removeEntry(i: number) {
    const next = entries.filter((_, idx) => idx !== i);
    let compIdx = 1;
    onChange(next.map(e => e.is_self ? e : { ...e, label: `Comp ${compIdx++}` }));
  }

  return (
    <div className="space-y-3">
      {entries.map((entry, i) => (
        <div key={i} className="flex items-center gap-3">
          {/* Color dot */}
          <div
            className="shrink-0 w-3 h-3 rounded-full"
            style={{ backgroundColor: ACCOUNT_COLORS[i % ACCOUNT_COLORS.length] }}
          />

          {/* Label */}
          <input
            value={entry.label}
            onChange={e => updateEntry(i, 'label', e.target.value)}
            placeholder="Label"
            className="w-24 shrink-0 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />

          {/* Handle / URL */}
          <div className="relative flex-1">
            {entry.platform === 'instagram' && (
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">@</span>
            )}
            <input
              value={entry.handle}
              onChange={e => handleHandleChange(i, e.target.value)}
              placeholder="@handle or profile URL (Instagram, LinkedIn, Twitter, Facebook, YouTube)"
              className={`w-full rounded-lg border border-gray-200 bg-white ${entry.platform === 'instagram' ? 'pl-7' : 'pl-3'} pr-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-200`}
            />
          </div>

          {/* Platform badge */}
          <PlatformBadge platform={entry.platform} />

          {/* Self badge */}
          {entry.is_self && (
            <span className="shrink-0 flex items-center gap-1 text-xs bg-violet-100 text-violet-700 px-2 py-1 rounded-lg">
              <User size={11} /> Me
            </span>
          )}

          {/* Remove */}
          {entries.length > 1 && (
            <button
              onClick={() => removeEntry(i)}
              className="shrink-0 text-gray-300 hover:text-red-400 transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>
      ))}

      <button
        onClick={addCompetitor}
        disabled={entries.length >= 8}
        className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <Plus size={14} />
        Add Competitor
      </button>
    </div>
  );
}
