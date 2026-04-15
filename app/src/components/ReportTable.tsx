'use client';

import { useState, useEffect, useRef } from 'react';
import { ExternalLink, Lock, Unlock, RefreshCw, Edit2, ChevronUp, ChevronDown, Trash2, Columns, TrendingUp, Loader2, X, Plus, Check, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tooltip from '@radix-ui/react-tooltip';
import { trpc } from '../lib/trpc';
import { useScrapingLimit } from '../context/ScrapingLimitContext';
import type { MetricsSnapshot, PostWithMetrics } from '../types';
import { fmtNum, fmtPct, fmtDate } from '../utils/formatters';
import { StatusBadge } from './StatusBadge';
import { TotalsRow } from './TotalsRow';
import { EditMetricsModal } from './EditMetricsModal';
import { PostTrendChart } from './PostTrendChart';
import type { ReportTotals } from '../types';
import { BUCKETS, SUB_BUCKETS } from '../constants/buckets';

interface Props {
  posts: PostWithMetrics[];
  totals: ReportTotals | undefined;
  scrapingPostIds: Set<string>;
  onRefetch: () => void;
  brandId?: string;       // drill-down mode: only show posts for this brand
  brandName?: string;     // shown in breadcrumb
  onTagFilter?: (tag: string) => void;
}

type SortKey = 'platform' | 'campaign' | 'format' | 'likes' | 'comments' | 'views' | 'reach' | 'active_eng' | 'active_eng_rate' | 'created_at';
type SortDir = 'asc' | 'desc';

const COL_HEADER        = 'px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap cursor-pointer select-none hover:text-gray-700';
const COL_HEADER_STATIC = 'px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap select-none';
const CELL              = 'px-3 py-2 text-sm text-gray-700 whitespace-nowrap';
const CELL_R            = 'px-3 py-2 text-sm text-gray-700 whitespace-nowrap text-right';

// All toggleable column IDs (in display order)
const ALL_COLS = [
  'brand_name','tagged',
  'platform','post_type','bucket','sub_bucket','campaign','tags','format','post','date',
  'impressions','reach','clicks','ctr','views','vtr',
  'likes','comments','shares','saves','others',
  'active_eng','eng_rate','passive_eng','passive_rate',
  'trend','status',
] as const;

type ColId = typeof ALL_COLS[number];

const COL_LABELS: Record<ColId, string> = {
  brand_name: 'Brand', tagged: 'Tagged',
  platform: 'Platform', post_type: 'Post Type', bucket: 'Bucket', sub_bucket: 'Sub-bucket',
  campaign: 'Campaign', tags: 'Tags', format: 'Format', post: 'Post', date: 'Date',
  impressions: 'Impressions', reach: 'Reach', clicks: 'Clicks', ctr: 'CTR',
  views: 'Views', vtr: 'VTR', likes: 'Likes', comments: 'Comments',
  shares: 'Shares', saves: 'Saves', others: 'Others',
  active_eng: 'Active Eng', eng_rate: 'Eng Rate', passive_eng: 'Passive Eng',
  passive_rate: 'Passive Rate', trend: 'Trend', status: 'Status',
};

const COL_GROUPS: { label: string; cols: ColId[] }[] = [
  { label: 'Brand',           cols: ['brand_name','tagged'] },
  { label: 'Identity',        cols: ['platform','post_type','bucket','sub_bucket','campaign','tags','format','post','date'] },
  { label: 'Manual Metrics',  cols: ['impressions','reach','clicks','ctr'] },
  { label: 'Scraped Metrics', cols: ['views','vtr','likes','comments','shares','saves','others'] },
  { label: 'Computed',        cols: ['active_eng','eng_rate','passive_eng','passive_rate'] },
  { label: 'Other',           cols: ['trend','status'] },
];

const DEFAULT_HIDDEN: ColId[] = ['brand_name', 'tagged'];

function loadVisibleCols(): Set<ColId> {
  try {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('report-visible-cols') : null;
    if (saved) {
      const validCols = new Set<ColId>(ALL_COLS);
      const parsed = JSON.parse(saved) as string[];
      return new Set(parsed.filter((col): col is ColId => validCols.has(col as ColId)));
    }
  } catch {}
  return new Set(ALL_COLS.filter(c => !DEFAULT_HIDDEN.includes(c as ColId)));
}

function saveVisibleCols(cols: Set<ColId>) {
  try { localStorage.setItem('report-visible-cols', JSON.stringify([...cols])); } catch {}
}

function storyTimeLabel(expiresAt: string | null): { label: string; color: string } | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return null; // already marked expired in DB
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const mins  = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const label = hours > 0 ? `${hours}h left` : `${mins}m left`;
  const color = hours >= 6 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600';
  return { label, color };
}

function TrendDialog({
  post,
  open,
  onClose,
}: {
  post: PostWithMetrics | null;
  open: boolean;
  onClose: () => void;
}) {
  const postId = post?.id ?? '';
  const { data, isLoading } = trpc.posts.snapshots.useQuery(
    { postId },
    { enabled: open && Boolean(postId) },
  );
  const snapshots = (data ?? []) as MetricsSnapshot[];

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,760px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white shadow-2xl focus:outline-none">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
            <div className="space-y-1">
              <Dialog.Title className="text-base font-semibold text-slate-900">
                Post Trend
              </Dialog.Title>
              {post && (
                <div className="text-sm text-slate-500">
                  <span className="font-medium text-slate-700">{post.platform}</span>
                  {' - '}{post.format}
                  {post.post_published_at ? ` - ${fmtDate(post.post_published_at)}` : ''}
                </div>
              )}
              {post?.brand_name && (
                <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  {post.brand_name}
                </div>
              )}
            </div>

            <Dialog.Close asChild>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close trend popup"
              >
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          <div className="px-6 py-5">
            {post?.post_url && (
              <a
                href={post.post_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline"
              >
                Open original post
                <ExternalLink size={14} />
              </a>
            )}

            {isLoading ? (
              <div className="flex min-h-[240px] items-center justify-center gap-2 text-sm text-slate-400">
                <Loader2 size={16} className="animate-spin" />
                Loading snapshots...
              </div>
            ) : (
              <PostTrendChart snapshots={snapshots} height={240} title="Views - monthly trend" />
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Tip({ children, tip }: { children: React.ReactNode; tip: string }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <span className="border-b border-dashed border-gray-400 cursor-help">{children}</span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="bg-gray-900 text-white text-xs px-2 py-1.5 rounded shadow-lg max-w-[200px] leading-snug z-50"
          sideOffset={4}
        >
          {tip}
          <Tooltip.Arrow className="fill-gray-900" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function SortIcon({ field, sortKey, dir }: { field: string; sortKey: SortKey; dir: SortDir }) {
  if (field !== sortKey) return <span className="text-gray-300"><ChevronUp size={10} /></span>;
  return dir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />;
}

type OriginTab = 'all' | 'manual' | 'scraped';

// ─── localStorage helpers ─────────────────────────────────────────────────────

const LS_TAGS        = 'report-used-tags';
const LS_BUCKETS     = 'report-custom-buckets';
const LS_SUB_BUCKETS = 'report-custom-sub-buckets';

function getStoredTags(): string[] {
  try { return JSON.parse(typeof window !== 'undefined' ? (localStorage.getItem(LS_TAGS) ?? '[]') : '[]'); } catch { return []; }
}
function addStoredTag(tag: string) {
  try { const s = new Set(getStoredTags()); s.add(tag); localStorage.setItem(LS_TAGS, JSON.stringify([...s])); } catch {}
}

function getCustomBuckets(): string[] {
  try { return JSON.parse(typeof window !== 'undefined' ? (localStorage.getItem(LS_BUCKETS) ?? '[]') : '[]'); } catch { return []; }
}
function addCustomBucket(val: string) {
  try { const s = new Set(getCustomBuckets()); s.add(val); localStorage.setItem(LS_BUCKETS, JSON.stringify([...s])); } catch {}
}

function getCustomSubBuckets(bucket: string): string[] {
  try {
    const raw = typeof window !== 'undefined' ? (localStorage.getItem(LS_SUB_BUCKETS) ?? '{}') : '{}';
    const map = JSON.parse(raw) as Record<string, string[]>;
    return Array.isArray(map[bucket]) ? map[bucket] : [];
  } catch { return []; }
}
function addCustomSubBucket(bucket: string, val: string) {
  try {
    const raw = typeof window !== 'undefined' ? (localStorage.getItem(LS_SUB_BUCKETS) ?? '{}') : '{}';
    const map = JSON.parse(raw) as Record<string, string[]>;
    const s = new Set(Array.isArray(map[bucket]) ? map[bucket] : []);
    s.add(val);
    map[bucket] = [...s];
    localStorage.setItem(LS_SUB_BUCKETS, JSON.stringify(map));
  } catch {}
}

// ─── Inline edit helpers ──────────────────────────────────────────────────────

function InlineBucketCell({ value, onSave }: { value: string | null; onSave: (val: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value ?? '');
  const [custom, setCustom]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function start() {
    const allBuckets = [...(BUCKETS as readonly string[]), ...getCustomBuckets()];
    setDraft(value ?? '');
    setCustom(value !== null && !allBuckets.includes(value));
    setEditing(true);
  }

  function save(val: string) {
    setEditing(false);
    if (custom && val && !(BUCKETS as readonly string[]).includes(val)) {
      addCustomBucket(val);
    }
    setCustom(false);
    if (val !== (value ?? '')) onSave(val);
  }

  function handleSelect(v: string) {
    if (v === '__other__') { setCustom(true); setDraft(''); setTimeout(() => inputRef.current?.focus(), 0); }
    else { save(v); }
  }

  if (!editing) {
    return (
      <span
        className="group flex items-center gap-1 cursor-pointer hover:text-brand-600 min-w-[60px]"
        onClick={start}
        title="Click to edit"
      >
        <span>{value ?? '—'}</span>
        <Pencil size={11} className="opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0" />
      </span>
    );
  }

  const allBucketOptions = [...(BUCKETS as readonly string[]), ...getCustomBuckets()];

  return (
    <span className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
      {custom ? (
        <>
          <input
            ref={inputRef}
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={() => save(draft)}
            onKeyDown={e => { if (e.key === 'Enter') save(draft); if (e.key === 'Escape') { setEditing(false); setCustom(false); } }}
            className="w-28 rounded border border-brand-300 px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400"
            placeholder="Custom bucket…"
          />
          <button onMouseDown={() => save(draft)} className="text-brand-600 hover:text-brand-800"><Check size={12} /></button>
        </>
      ) : (
        <select
          autoFocus
          value={draft}
          onChange={e => handleSelect(e.target.value)}
          onBlur={() => setTimeout(() => setEditing(false), 150)}
          className="rounded border border-brand-300 px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400"
        >
          <option value="">— None —</option>
          {allBucketOptions.map(b => <option key={b} value={b}>{b}</option>)}
          <option value="__other__">Other (custom)…</option>
        </select>
      )}
      <button onClick={() => { setEditing(false); setCustom(false); }} className="text-gray-400 hover:text-gray-600"><X size={12} /></button>
    </span>
  );
}

function InlineSubBucketCell({ value, bucket, onSave }: { value: string | null; bucket: string | null; onSave: (val: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value ?? '');
  const [custom, setCustom]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const subOptions = bucket ? SUB_BUCKETS[bucket] : undefined;
  const isFreetext = !subOptions || subOptions === 'freetext';

  function start() {
    setDraft(value ?? '');
    const opts = bucket ? SUB_BUCKETS[bucket] : undefined;
    if (!opts || opts === 'freetext') {
      setCustom(true);
    } else {
      const allOpts = [...opts, ...getCustomSubBuckets(bucket ?? '')];
      setCustom(value !== null && !allOpts.includes(value));
    }
    setEditing(true);
  }

  function save(val: string) {
    setEditing(false);
    if (custom && val && bucket && Array.isArray(subOptions) && !subOptions.includes(val)) {
      addCustomSubBucket(bucket, val);
    }
    setCustom(false);
    if (val !== (value ?? '')) onSave(val);
  }

  function handleSelect(v: string) {
    if (v === '__other__') { setCustom(true); setDraft(''); setTimeout(() => inputRef.current?.focus(), 0); }
    else { save(v); }
  }

  if (!editing) {
    return (
      <span
        className="group flex items-center gap-1 cursor-pointer hover:text-brand-600 min-w-[60px]"
        onClick={start}
        title="Click to edit"
      >
        <span>{value ?? '—'}</span>
        <Pencil size={11} className="opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0" />
      </span>
    );
  }

  const customSubOptions = bucket ? getCustomSubBuckets(bucket) : [];
  const allSubOptions = Array.isArray(subOptions) ? [...subOptions, ...customSubOptions] : customSubOptions;

  return (
    <span className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
      {(isFreetext || custom) ? (
        <>
          <input
            ref={inputRef}
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={() => save(draft)}
            onKeyDown={e => { if (e.key === 'Enter') save(draft); if (e.key === 'Escape') { setEditing(false); setCustom(false); } }}
            className="w-28 rounded border border-brand-300 px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400"
            placeholder="Sub-bucket…"
          />
          <button onMouseDown={() => save(draft)} className="text-brand-600 hover:text-brand-800"><Check size={12} /></button>
        </>
      ) : (
        <select
          autoFocus
          value={draft}
          onChange={e => handleSelect(e.target.value)}
          onBlur={() => setTimeout(() => setEditing(false), 150)}
          className="rounded border border-brand-300 px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400"
        >
          <option value="">— None —</option>
          {allSubOptions.map(s => <option key={s} value={s}>{s}</option>)}
          <option value="__other__">Other (custom)…</option>
        </select>
      )}
      <button onClick={() => { setEditing(false); setCustom(false); }} className="text-gray-400 hover:text-gray-600"><X size={12} /></button>
    </span>
  );
}

function InlineTagsCell({
  value, onSave, onFilter,
}: {
  value: string | null;
  onSave: (val: string) => void;
  onFilter?: (tag: string) => void;
}) {
  const [adding, setAdding]   = useState(false);
  const [newTag, setNewTag]   = useState('');
  const [storedTags, setStoredTags] = useState<string[]>([]);
  const inputRef    = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const tags = value ? value.split(',').map(t => t.trim()).filter(Boolean) : [];

  // Load stored tags when dropdown opens
  useEffect(() => {
    if (adding) setStoredTags(getStoredTags());
  }, [adding]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!adding) return;
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setAdding(false);
        setNewTag('');
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [adding]);

  function removeTag(tag: string) {
    const next = tags.filter(t => t !== tag).join(', ');
    onSave(next);
  }

  function addTag(tagToAdd?: string) {
    const trimmed = (tagToAdd ?? newTag).trim();
    if (!trimmed) { setAdding(false); setNewTag(''); return; }
    const next = [...tags.filter(t => t !== trimmed), trimmed].join(', ');
    onSave(next);
    addStoredTag(trimmed);
    setNewTag('');
    setAdding(false);
  }

  const filtered = storedTags.filter(t => !tags.includes(t) && (newTag === '' || t.toLowerCase().includes(newTag.toLowerCase())));

  return (
    <span className="flex flex-wrap items-center gap-1" onClick={e => e.stopPropagation()}>
      {tags.map(tag => (
        <span key={tag} className="inline-flex items-center gap-0.5 rounded-full bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 text-[11px] text-indigo-700 group">
          <span
            className="cursor-pointer hover:text-indigo-900 hover:underline"
            title={`Filter by "${tag}"`}
            onClick={() => onFilter?.(tag)}
          >
            {tag}
          </span>
          <button
            className="opacity-50 group-hover:opacity-100 hover:text-red-500 transition-opacity leading-none"
            title="Remove tag"
            onClick={() => removeTag(tag)}
          >
            <X size={9} />
          </button>
        </span>
      ))}
      {tags.length === 0 && !adding && (
        <span className="text-gray-300 text-xs">—</span>
      )}
      {adding ? (
        <span className="relative inline-flex items-center gap-1" ref={dropdownRef}>
          <input
            ref={inputRef}
            autoFocus
            value={newTag}
            onChange={e => setNewTag(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') addTag();
              if (e.key === 'Escape') { setAdding(false); setNewTag(''); }
            }}
            className="w-24 rounded border border-brand-300 px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400"
            placeholder="Tag name…"
          />
          <button onMouseDown={() => addTag()} className="text-brand-600 hover:text-brand-800"><Check size={12} /></button>
          {/* Dropdown of previously used tags */}
          {(filtered.length > 0 || newTag) && (
            <div className="absolute top-full left-0 mt-1 z-50 min-w-[140px] max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1">
              {filtered.map(t => (
                <button
                  key={t}
                  onMouseDown={() => addTag(t)}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-1.5"
                >
                  <span className="inline-flex items-center rounded-full bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 text-[10px] text-indigo-700">{t}</span>
                </button>
              ))}
              {newTag.trim() && !storedTags.includes(newTag.trim()) && (
                <button
                  onMouseDown={() => addTag(newTag.trim())}
                  className="w-full text-left px-3 py-1.5 text-xs text-brand-600 hover:bg-brand-50 flex items-center gap-1"
                >
                  <Plus size={10} />
                  Create &ldquo;{newTag.trim()}&rdquo;
                </button>
              )}
            </div>
          )}
        </span>
      ) : (
        <button
          className="flex items-center justify-center w-4 h-4 rounded-full bg-gray-100 hover:bg-indigo-100 text-gray-400 hover:text-indigo-600 transition-colors"
          title="Add tag"
          onClick={() => { setAdding(true); setTimeout(() => inputRef.current?.focus(), 0); }}
        >
          <Plus size={9} />
        </button>
      )}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function ReportTable({ posts, totals, scrapingPostIds, onRefetch, brandId, onTagFilter }: Props) {
  const { disabled: scrapingDisabled } = useScrapingLimit();
  const [originTab, setOriginTab]     = useState<OriginTab>('all');
  const [sortKey, setSortKey]         = useState<SortKey>('created_at');
  const [sortDir, setSortDir]         = useState<SortDir>('desc');
  const [editPost, setEditPost]       = useState<PostWithMetrics | null>(null);
  const [pendingScrapeIds, setPendingScrapeIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [visibleCols, setVisibleCols] = useState<Set<ColId>>(loadVisibleCols);
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const [trendPost, setTrendPost] = useState<PostWithMetrics | null>(null);
  const colPickerRef = useRef<HTMLDivElement>(null);

  // Close column picker on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node)) {
        setColPickerOpen(false);
      }
    }
    if (colPickerOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [colPickerOpen]);

  // Clear spinner for posts that have finished scraping
  useEffect(() => {
    if (pendingScrapeIds.size === 0) return;
    const resolved = posts.filter(p => pendingScrapeIds.has(p.id) && p.scrape_status !== 'pending');
    if (resolved.length > 0) {
      setPendingScrapeIds(prev => {
        const n = new Set(prev);
        resolved.forEach(p => n.delete(p.id));
        return n;
      });
    }
  }, [posts, pendingScrapeIds]);

  const updatePost = trpc.posts.update.useMutation({
    onSuccess: () => { toast.success('Updated'); onRefetch(); },
    onError: e  => toast.error(e.message),
  });

  const deletePost = trpc.posts.delete.useMutation();

  const triggerOne = trpc.scrape.triggerOne.useMutation({
    onSuccess: () => { toast.success('Scrape queued'); onRefetch(); },
    onError: (e, vars) => {
      toast.error(e.message);
      const failedId = vars && typeof vars === 'object' && 'id' in vars ? vars.id : undefined;
      if (failedId) {
        setPendingScrapeIds(prev => { const n = new Set(prev); n.delete(failedId); return n; });
      }
    },
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function toggleAll() {
    if (selectedIds.size === sorted.length && sorted.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sorted.map(p => p.id)));
    }
  }

  function toggleCol(col: ColId) {
    setVisibleCols(prev => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col); else next.add(col);
      saveVisibleCols(next);
      return next;
    });
  }

  function showAllCols() {
    const next = new Set(ALL_COLS);
    saveVisibleCols(next);
    setVisibleCols(next);
  }

  function retrySelected() {
    if (scrapingDisabled) return;
    const ids = Array.from(selectedIds);
    ids.forEach(id => {
      setPendingScrapeIds(prev => new Set(prev).add(id));
      triggerOne.mutate({ id });
    });
    setSelectedIds(new Set());
  }

  async function deleteSelected() {
    const ids = Array.from(selectedIds);
    try {
      await Promise.all(ids.map(id => deletePost.mutateAsync({ id })));
      toast.success(`Deleted ${ids.length} post${ids.length > 1 ? 's' : ''}`);
      setSelectedIds(new Set());
      onRefetch();
    } catch {
      toast.error('Failed to delete some posts');
      onRefetch();
    }
  }

  // Apply tab filter (client-side) and brand filter
  const tabFiltered = posts.filter(p => {
    if (brandId && p.brand_id !== brandId) return false;
    if (originTab === 'manual')  return p.data_origin === 'manual';
    if (originTab === 'scraped') return p.data_origin === 'scraped';
    return true;
  });

  const sorted = [...tabFiltered].sort((a, b) => {
    let av: number | string = 0, bv: number | string = 0;
    switch (sortKey) {
      case 'platform':         av = a.platform;   bv = b.platform;   break;
      case 'campaign':         av = a.campaign ?? ''; bv = b.campaign ?? ''; break;
      case 'format':           av = a.format;     bv = b.format;     break;
      case 'likes':            av = a.metrics?.likes ?? 0; bv = b.metrics?.likes ?? 0; break;
      case 'comments':         av = a.metrics?.comments ?? 0; bv = b.metrics?.comments ?? 0; break;
      case 'views':            av = a.metrics?.views ?? 0; bv = b.metrics?.views ?? 0; break;
      case 'reach':            av = a.metrics?.reach ?? 0; bv = b.metrics?.reach ?? 0; break;
      case 'active_eng':       av = a.metrics?.active_eng ?? 0; bv = b.metrics?.active_eng ?? 0; break;
      case 'active_eng_rate':  av = a.metrics?.active_eng_rate ?? 0; bv = b.metrics?.active_eng_rate ?? 0; break;
      case 'created_at':       av = a.created_at ?? ''; bv = b.created_at ?? ''; break;
    }
    if (typeof av === 'string') {
      return sortDir === 'asc' ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
    }
    return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  const s = (col: ColId) => visibleCols.has(col);

  // Sortable header with tooltip
  const H = ({ k, label, tip, right = false }: { k: SortKey; label: string; tip: string; right?: boolean }) => (
    <th className={right ? `${COL_HEADER} text-right` : COL_HEADER} onClick={() => toggleSort(k)}>
      <span className={`flex items-center gap-0.5${right ? ' justify-end' : ''}`}>
        <Tip tip={tip}>{label}</Tip>
        <SortIcon field={k} sortKey={sortKey} dir={sortDir} />
      </span>
    </th>
  );

  // Static header with tooltip
  const TH = ({ label, tip, right = false }: { label: string; tip: string; right?: boolean }) => (
    <th className={right ? `${COL_HEADER_STATIC} text-right` : COL_HEADER_STATIC}>
      <Tip tip={tip}>{label}</Tip>
    </th>
  );

  const allSelected = selectedIds.size === sorted.length && sorted.length > 0;
  const hiddenCount = ALL_COLS.length - visibleCols.size;

  return (
    <Tooltip.Provider delayDuration={400}>
      <>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 px-4 py-2 mb-2 bg-red-50 border border-red-200 rounded-lg text-sm">
            <span className="text-red-700 font-medium">{selectedIds.size} selected</span>
            <button
              onClick={retrySelected}
              className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors text-xs font-medium"
            >
              <RefreshCw size={12} />
              Retry selected
            </button>
            <button
              onClick={deleteSelected}
              className="flex items-center gap-1.5 px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-xs font-medium"
            >
              <Trash2 size={12} />
              Delete selected
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-red-500 hover:text-red-700 text-xs"
            >
              Clear selection
            </button>
          </div>
        )}

        {/* Tabs: All / Manual / Scraped */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            {(['all', 'manual', 'scraped'] as OriginTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setOriginTab(tab)}
                className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  originTab === tab
                    ? 'bg-white text-brand-700 shadow-sm border border-gray-200'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab === 'all' ? 'All Posts' : tab === 'manual' ? 'Manual' : 'Scraped'}
              </button>
            ))}
          </div>

          {/* Toolbar: column picker */}
          <div className="flex items-center justify-end">
          <div className="relative" ref={colPickerRef}>
            <button
              onClick={() => setColPickerOpen(o => !o)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                hiddenCount > 0
                  ? 'border-brand-300 bg-brand-50 text-brand-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}
            >
              <Columns size={13} />
              Columns{hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ''}
            </button>

            {colPickerOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 w-64 rounded-xl border border-gray-200 bg-white shadow-lg p-3 space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-700">Show / hide columns</span>
                  {hiddenCount > 0 && (
                    <button onClick={showAllCols} className="text-xs text-brand-600 hover:underline">
                      Show all
                    </button>
                  )}
                </div>
                {COL_GROUPS.map(group => (
                  <div key={group.label}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{group.label}</p>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                      {group.cols.map(col => (
                        <label key={col} className="flex items-center gap-1.5 cursor-pointer select-none text-xs text-gray-700 py-0.5">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 text-brand-600 h-3 w-3 cursor-pointer"
                            checked={visibleCols.has(col)}
                            onChange={() => toggleCol(col)}
                          />
                          {COL_LABELS[col]}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          </div>
        </div>

        <div className="overflow-auto rounded-xl border border-gray-100 shadow-sm bg-white max-h-[calc(100vh-240px)]">
          <table className="min-w-full border-separate border-spacing-0">
            <thead className="bg-gray-50 sticky top-0 z-20">
              <tr>
                {/* Always-visible: checkbox */}
                <th className="px-3 py-2 w-8 bg-gray-50">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-brand-600 cursor-pointer"
                    checked={allSelected}
                    onChange={toggleAll}
                  />
                </th>
                {s('brand_name')       && <TH label="Brand"       tip="Brand/profile this post was scraped from" />}
                {s('tagged')           && <TH label="Tagged"       tip="Whether this post mentions the brand's handle in its caption" />}
                {s('platform')         && <H k="platform" label="Platform"    tip="Social media platform this post was published on" />}
                {s('post_type')        && <TH label="Post Type"  tip="Instagram classification: Own Post, Collab, Tagged, or Non-Tagged (relative to connected account)" />}
                {s('bucket')           && <TH label="Bucket"      tip="Content category or theme grouping for this post" />}
                {s('sub_bucket')  && <TH label="Sub-bucket"  tip="More specific sub-category within the bucket" />}
                {s('campaign')    && <H k="campaign" label="Campaign"    tip="Campaign name this post belongs to" />}
                {s('tags')        && <TH label="Tags"        tip="Custom labels for filtering and categorising posts" />}
                {s('format')      && <H k="format"   label="Format"      tip="Content format: Static image, Reel, Video Post, Story, Carousel, etc." />}
                {s('post')        && <TH label="Post"        tip="Link to the original post on the platform" />}
                {s('date')              && <TH label="Date"         tip="Date the post was published" />}
                {s('impressions') && <TH label="Impressions" tip="Total times the post was displayed (manual entry — amber background)" right />}
                {s('reach')       && <H k="reach"    label="Reach"       tip="Unique accounts that saw the post (manual entry — amber background)" />}
                {s('clicks')      && <TH label="Clicks"      tip="Number of link clicks on the post (manual entry — amber background)" right />}
                {s('ctr')         && <TH label="CTR"         tip="Click-through rate = Clicks ÷ Impressions" right />}
                {s('views')       && <H k="views"    label="Views"       tip="Total video views (scraped from platform)" />}
                {s('vtr')         && <TH label="VTR"         tip="View-through rate = Views ÷ Impressions" right />}
                {s('likes')       && <H k="likes"    label="Likes"       tip="Total likes or reactions (scraped from platform)" />}
                {s('comments')    && <H k="comments" label="Comments"    tip="Total comments on the post (scraped from platform)" />}
                {s('shares')      && <TH label="Shares"      tip="Shares or retweets (scraped from platform)" right />}
                {s('saves')       && <TH label="Saves"       tip="Saves or bookmarks (scraped from platform)" right />}
                {s('others')      && <TH label="Others"      tip="Other reactions such as Wow, Angry, etc." right />}
                {s('active_eng')  && <H k="active_eng"      label="Active Eng"  tip="Active engagement = Likes + Comments + Shares + Saves" />}
                {s('eng_rate')    && <H k="active_eng_rate" label="Eng Rate"    tip="Engagement rate = Active Engagement ÷ Reach (or Impressions)" />}
                {s('passive_eng') && <TH label="Passive Eng"  tip="Passive engagement = Views + Impressions" right />}
                {s('passive_rate')&& <TH label="Passive Rate" tip="Passive engagement rate = Passive Engagement ÷ Reach" right />}
                {s('trend')       && <TH label="Trend"        tip="Click to view monthly views trend from end-of-month snapshots" />}
                {s('status')      && <TH label="Status"       tip="Current scraping status for this post" />}
                {/* Always-visible: actions */}
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap bg-gray-50">
                  <Tip tip="Lock, re-scrape, or manually edit metrics for this post">Actions</Tip>
                </th>
              </tr>
            </thead>
            <tbody>
              {totals && <TotalsRow totals={totals} visibleCols={visibleCols} />}
              {sorted.map(post => {
                const m        = post.metrics;
                const locked   = post.lock === 1;
                const isLive   = scrapingPostIds.has(post.id) || pendingScrapeIds.has(post.id);
                const isStory  = post.format === 'Story';
                const isExpired = post.scrape_status === 'expired' ||
                  (isStory && post.story_expires_at != null && new Date(post.story_expires_at) <= new Date());
                const storyTime = isStory && !isExpired ? storyTimeLabel(post.story_expires_at) : null;

                return (
                  <tr
                    key={post.id}
                    className={`border-t border-gray-50 hover:bg-gray-50/50 transition-colors ${locked ? 'opacity-50' : ''} ${isExpired ? 'opacity-60' : ''} ${selectedIds.has(post.id) ? 'bg-red-50/30' : ''}`}
                  >
                      <td className="px-3 py-2 w-8">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-brand-600 cursor-pointer"
                          checked={selectedIds.has(post.id)}
                          onChange={() => toggleSelect(post.id)}
                        />
                      </td>
                      {s('brand_name') && (
                        <td className={CELL}>
                          {post.brand_name
                            ? <span className="font-medium text-gray-800">{post.brand_name}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                      )}
                      {s('tagged') && (
                        <td className={CELL}>
                          {post.data_origin === 'scraped'
                            ? post.tagged
                              ? <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"><span className="h-1.5 w-1.5 rounded-full bg-green-500" />Tagged</span>
                              : <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500"><span className="h-1.5 w-1.5 rounded-full bg-gray-300" />Non-tagged</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                      )}
                      {s('platform') && (
                        <td className={CELL}>
                          <span className="inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                            {post.platform}
                          </span>
                        </td>
                      )}
                      {s('post_type') && (
                        <td className={CELL}>
                          {post.post_type_category === 'own_post'   && <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Own Post</span>}
                          {post.post_type_category === 'collab'      && <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">Collab</span>}
                          {post.post_type_category === 'tagged'      && <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">Tagged</span>}
                          {post.post_type_category === 'non_tagged'  && <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Non-Tagged</span>}
                          {!post.post_type_category && <span className="text-gray-300">—</span>}
                        </td>
                      )}
                      {s('bucket')     && (
                        <td className={CELL}>
                          <InlineBucketCell
                            value={post.content_bucket}
                            onSave={val => updatePost.mutate({ id: post.id, content_bucket: val || undefined })}
                          />
                        </td>
                      )}
                      {s('sub_bucket') && (
                        <td className={CELL}>
                          <InlineSubBucketCell
                            value={post.sub_bucket}
                            bucket={post.content_bucket}
                            onSave={val => updatePost.mutate({ id: post.id, sub_bucket: val || undefined })}
                          />
                        </td>
                      )}
                      {s('campaign')   && <td className={CELL}>{post.campaign ?? '—'}</td>}
                      {s('tags')       && (
                        <td className={`${CELL} max-w-[200px]`}>
                          <InlineTagsCell
                            value={post.tags}
                            onSave={val => updatePost.mutate({ id: post.id, tags: val || undefined })}
                            onFilter={onTagFilter}
                          />
                        </td>
                      )}
                      {s('format')     && (
                        <td className={CELL}>
                          <span className="flex items-center gap-1.5 flex-wrap">
                            {post.format}
                            {isExpired && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">Expired</span>
                            )}
                            {storyTime && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${storyTime.color}`}>
                                {storyTime.label}
                              </span>
                            )}
                          </span>
                        </td>
                      )}
                      {s('post')        && (
                        <td className={CELL}>
                          <div className="flex flex-col gap-0.5">
                            {isStory && isExpired && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium w-fit">Expired</span>
                            )}
                            {isStory && !isExpired && storyTime && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium w-fit ${storyTime.color}`}>
                                {storyTime.label}
                              </span>
                            )}
                            <a href={post.post_url} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 text-brand-600 hover:underline">
                              Link <ExternalLink size={11} />
                            </a>
                          </div>
                        </td>
                      )}
                      {s('date')        && <td className={CELL}>{fmtDate(post.post_published_at)}</td>}
                      {s('impressions') && <td className={`${CELL_R} ${m?.impressions_source === 'manual' ? 'bg-amber-50/50' : ''}`}>{fmtNum(m?.impressions)}</td>}
                      {s('reach')       && <td className={`${CELL_R} ${m?.reach_source === 'manual' ? 'bg-amber-50/50' : ''}`}>{fmtNum(m?.reach)}</td>}
                      {s('clicks')      && <td className={`${CELL_R} ${m?.clicks_source === 'manual' ? 'bg-amber-50/50' : ''}`}>{fmtNum(m?.clicks)}</td>}
                      {s('ctr')         && <td className={CELL_R}>{fmtPct(m?.ctr)}</td>}
                      {s('views')       && <td className={CELL_R}>{fmtNum(m?.views)}</td>}
                      {s('vtr')         && <td className={CELL_R}>{fmtPct(m?.vtr)}</td>}
                      {s('likes')       && <td className={CELL_R}>{fmtNum(m?.likes)}</td>}
                      {s('comments')    && <td className={CELL_R}>{fmtNum(m?.comments)}</td>}
                      {s('shares')      && <td className={CELL_R}>{fmtNum(m?.shares)}</td>}
                      {s('saves')       && <td className={CELL_R}>{fmtNum(m?.saves)}</td>}
                      {s('others')      && <td className={CELL_R}>{fmtNum(m?.others)}</td>}
                      {s('active_eng')  && <td className={CELL_R}>{fmtNum(m?.active_eng)}</td>}
                      {s('eng_rate')    && <td className={CELL_R}>{fmtPct(m?.active_eng_rate)}</td>}
                      {s('passive_eng') && <td className={CELL_R}>{fmtNum(m?.passive_eng)}</td>}
                      {s('passive_rate')&& <td className={CELL_R}>{fmtPct(m?.passive_eng_rate)}</td>}
                      {s('trend')       && (
                        <td className="px-3 py-2">
                          <button
                            onClick={() => setTrendPost(post)}
                            title="Open trend popup"
                            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-gray-400 transition-colors hover:bg-indigo-50 hover:text-indigo-500"
                          >
                            <TrendingUp size={12} />
                            View
                          </button>
                        </td>
                      )}
                      {s('status')      && (
                        <td className="px-3 py-2">
                          <StatusBadge
                            status={post.scrape_status}
                            scrapedAt={m?.scraped_at}
                            lastError={post.last_error}
                            isLive={isLive}
                          />
                        </td>
                      )}
                      {/* Actions: always visible */}
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <button
                            title={locked ? 'Unlock' : 'Lock'}
                            onClick={() => updatePost.mutate({ id: post.id, lock: locked ? 0 : 1 })}
                            className="text-gray-400 hover:text-brand-600 transition-colors"
                          >
                            {locked ? <Unlock size={14} /> : <Lock size={14} />}
                          </button>
                          <button
                            title={scrapingDisabled ? 'Scraping paused — usage limit exceeded' : 'Scrape now'}
                            disabled={locked || isLive || isExpired || scrapingDisabled}
                            onClick={() => {
                              setPendingScrapeIds(prev => new Set(prev).add(post.id));
                              triggerOne.mutate({ id: post.id });
                            }}
                            className="text-gray-400 hover:text-emerald-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            <RefreshCw size={14} className={isLive ? 'animate-spin' : ''} />
                          </button>
                          <button
                            title="Edit metrics"
                            onClick={() => setEditPost(post)}
                            className="text-gray-400 hover:text-blue-600 transition-colors"
                          >
                            <Edit2 size={14} />
                          </button>
                        </div>
                      </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={ALL_COLS.length + 2} className="px-4 py-12 text-center text-sm text-gray-400">
                    {originTab !== 'all'
                      ? `No ${originTab} posts found.`
                      : 'No posts found. Add a post URL or brand to get started.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {editPost && (
          <EditMetricsModal
            post={editPost}
            open={true}
            onClose={() => setEditPost(null)}
            onSuccess={onRefetch}
          />
        )}
        <TrendDialog
          post={trendPost}
          open={trendPost !== null}
          onClose={() => setTrendPost(null)}
        />
      </>
    </Tooltip.Provider>
  );
}
