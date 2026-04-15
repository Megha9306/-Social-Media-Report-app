'use client';

import { useState, useRef } from 'react';
import { ExternalLink, Info, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { ACCOUNT_COLORS } from './HandleInput';
import { fmtNum, fmtPct, fmtDate } from '../../utils/formatters';
import { Tooltip } from '../Tooltip';

function displayHandle(handle: string): string {
  if (handle.toLowerCase().includes('linkedin.com/')) {
    const parts = handle.replace(/^https?:\/\//i, '').split('/').filter(Boolean);
    return parts[parts.length - 1] ?? handle;
  }
  return `@${handle}`;
}

interface Post {
  id: string;
  post_url: string | null;
  post_type: string | null;
  published_at: string | null;
  likes: number;
  comments: number;
  views: number | null;
  engagement: number;
  engagement_rate: number | null;
  content_bucket: string | null;
  sub_bucket: string | null;
  tags: string | null;
}

interface AccountPosts {
  label: string;
  handle: string;
  posts: Post[];
}

interface Props {
  accounts: AccountPosts[];
  onUpdatePost?: (postId: string, field: 'content_bucket' | 'sub_bucket' | 'tags', value: string) => Promise<void>;
}

const TYPE_COLOR: Record<string, string> = {
  Image:   'bg-indigo-100 text-indigo-700',
  Video:   'bg-amber-100 text-amber-700',
  Sidecar: 'bg-teal-100 text-teal-700',
};

const COL_HEADERS = [
  { label: 'Likes',      title: 'Total reactions per post (Likes, Love, Celebrate, etc.)' },
  { label: 'Comments',   title: 'Total comment count per post' },
  { label: 'Views',      title: 'Instagram: video/reel play count.\nLinkedIn: not available (impressions not exposed without OAuth).\nShown as — when no video posts exist.' },
  { label: 'Engagement', title: 'Formula: Likes + Comments per post\nAbsolute engagement volume regardless of follower count.' },
  { label: 'Eng. Rate',  title: 'Formula: (Likes + Comments) ÷ Followers × 100%\nShows how engaged the audience is relative to its size.\nShown as — if followers are unknown.' },
];

// ─── Inline editable cell ────────────────────────────────────────────────────

interface EditCellProps {
  value: string | null;
  placeholder?: string;
  onSave: (v: string) => Promise<void>;
}

function EditCell({ value, placeholder = '—', onSave }: EditCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setDraft(value ?? '');
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed !== (value ?? '')) {
      await onSave(trimmed);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { setEditing(false); }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full min-w-[80px] rounded border border-indigo-300 px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
      />
    );
  }

  return (
    <button
      onClick={startEdit}
      className="w-full text-left text-xs text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded px-1 py-0.5 transition-colors truncate max-w-[100px]"
      title={value ?? 'Click to edit'}
    >
      {value || <span className="text-gray-300">{placeholder}</span>}
    </button>
  );
}

// ─── CSV download ────────────────────────────────────────────────────────────

function downloadCsv(a: AccountPosts) {
  const header = ['Date', 'Type', 'Likes', 'Comments', 'Views', 'Engagement', 'Eng. Rate', 'Bucket', 'Sub-bucket', 'Tags', 'URL'];
  const rows = a.posts.map(p => [
    p.published_at ?? '',
    p.post_type ?? '',
    String(p.likes),
    String(p.comments),
    p.views != null ? String(p.views) : '',
    String(p.engagement),
    p.engagement_rate != null ? (p.engagement_rate * 100).toFixed(2) + '%' : '',
    p.content_bucket ?? '',
    p.sub_bucket ?? '',
    p.tags ?? '',
    p.post_url ?? '',
  ]);
  const csv = [header, ...rows]
    .map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = `${a.label.replace(/\s+/g, '-')}-posts.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ─── Main component ──────────────────────────────────────────────────────────

export function PostsCompareTable({ accounts, onUpdatePost }: Props) {
  // All sections start collapsed; user clicks header to expand
  const [expandedSet, setExpandedSet] = useState<Set<string>>(() => new Set());

  function toggleAccount(handle: string) {
    setExpandedSet(prev => {
      const next = new Set(prev);
      if (next.has(handle)) next.delete(handle);
      else next.add(handle);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      {accounts.map((a, i) => {
        const color     = ACCOUNT_COLORS[i % ACCOUNT_COLORS.length];
        const expanded  = expandedSet.has(a.handle);
        const postCount = a.posts.length;

        return (
          <div key={a.handle} className="rounded-xl border border-gray-100 overflow-hidden">
            {/* ── Accordion header ── */}
            <div className="flex items-center bg-white border-b border-transparent hover:bg-gray-50 transition-colors">
              <button
                onClick={() => toggleAccount(a.handle)}
                className="flex-1 flex items-center gap-2 px-4 py-3 text-left"
              >
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="text-sm font-semibold text-gray-800">{a.label}</span>
                <Tooltip content={a.handle} position="top">
                  <span className="text-xs text-gray-400">{displayHandle(a.handle)}</span>
                </Tooltip>
                <span className="ml-1 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-medium">
                  {postCount} post{postCount !== 1 ? 's' : ''}
                </span>
                <span className="ml-auto text-gray-400">
                  {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </span>
              </button>
              <button
                onClick={() => downloadCsv(a)}
                title={`Download ${a.label} posts as CSV`}
                className="px-3 py-3 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors border-l border-gray-100 shrink-0"
              >
                <Download size={13} />
              </button>
            </div>

            {/* ── Table body (shown when expanded) ── */}
            {expanded && (
              <div className="overflow-x-auto border-t border-gray-100">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Date</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Type</th>
                      {COL_HEADERS.map(col => (
                        <th
                          key={col.label}
                          title={col.title}
                          className="text-right px-3 py-2 font-medium text-gray-500 cursor-help"
                        >
                          <span className="inline-flex items-center justify-end gap-1">
                            {col.label}
                            <Info size={10} className="text-gray-300 flex-shrink-0" />
                          </span>
                        </th>
                      ))}
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Bucket</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Sub-bucket</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Tags</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {postCount === 0 ? (
                      <tr>
                        <td colSpan={11} className="text-center py-6 text-gray-400">No posts scraped</td>
                      </tr>
                    ) : a.posts.map((p, j) => (
                      <tr key={j} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-2 text-gray-500">{p.published_at ? fmtDate(p.published_at) : '—'}</td>
                        <td className="px-3 py-2">
                          {p.post_type ? (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${TYPE_COLOR[p.post_type] ?? 'bg-gray-100 text-gray-600'}`}>
                              {p.post_type}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700">{fmtNum(p.likes)}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{fmtNum(p.comments)}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{p.views != null ? fmtNum(p.views) : '—'}</td>
                        <td className="px-3 py-2 text-right font-medium text-gray-800">{fmtNum(p.engagement)}</td>
                        <td className="px-3 py-2 text-right font-semibold" style={{ color }}>
                          {p.engagement_rate != null ? fmtPct(p.engagement_rate, 2) : '—'}
                        </td>
                        <td className="px-3 py-2">
                          <EditCell
                            value={p.content_bucket}
                            placeholder="bucket"
                            onSave={v => onUpdatePost ? onUpdatePost(p.id, 'content_bucket', v) : Promise.resolve()}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <EditCell
                            value={p.sub_bucket}
                            placeholder="sub-bucket"
                            onSave={v => onUpdatePost ? onUpdatePost(p.id, 'sub_bucket', v) : Promise.resolve()}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <EditCell
                            value={p.tags}
                            placeholder="tags"
                            onSave={v => onUpdatePost ? onUpdatePost(p.id, 'tags', v) : Promise.resolve()}
                          />
                        </td>
                        <td className="px-3 py-2">
                          {p.post_url && (
                            <a href={p.post_url} target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-indigo-500 transition-colors">
                              <ExternalLink size={11} />
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
