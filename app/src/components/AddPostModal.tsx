'use client';

import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import { X, Plus, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { trpc } from '../lib/trpc';
import { BUCKETS, SUB_BUCKETS } from '../constants/buckets';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultPlatform?: string;
  defaultFormat?: string;
  lockPlatformFormat?: boolean;
}

const PLATFORMS = ['Instagram', 'Facebook', 'Twitter', 'LinkedIn', 'YouTube'] as const;
const FORMATS   = ['Static', 'Carousel', 'Gif', 'Reel', 'Video Post', 'Story', 'Article'] as const;


export function AddPostModal({ open, onClose, onSuccess, defaultPlatform, defaultFormat, lockPlatformFormat }: Props) {
  // Single tab
  const [url, setUrl]               = useState('');
  const [platform, setPlatform]     = useState('');
  const [format, setFormat]         = useState('');
  const [bucket, setBucket]         = useState('');
  const [subBucket, setSubBucket]   = useState('');
  const [campaign, setCampaign]     = useState('');
  const [tags, setTags]             = useState('');
  const [targetCompany, setTargetCompany] = useState('');

  // Bulk tab
  const [bulkText, setBulkText]     = useState('');

  // Debounce the URL so detectUrl doesn't fire on every keystroke
  const [debouncedUrl, setDebouncedUrl] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedUrl(url), 500);
    return () => clearTimeout(t);
  }, [url]);

  const detect = trpc.posts.detectUrl.useQuery(
    { url: debouncedUrl },
    { enabled: debouncedUrl.length > 10 && !lockPlatformFormat, staleTime: 60_000 }
  );

  const createPost = trpc.posts.create.useMutation({
    onSuccess: () => { toast.success('Post added'); onSuccess(); resetAndClose(); },
    onError: e  => toast.error(e.message),
  });

  const bulkCreate = trpc.posts.bulkCreate.useMutation({
    onSuccess: (data) => {
      const ok    = data.results.filter(r => r.id).length;
      const fail  = data.results.filter(r => r.error).length;
      toast.success(`Added ${ok} post${ok !== 1 ? 's' : ''}${fail ? `, ${fail} failed` : ''}`);
      onSuccess();
      resetAndClose();
    },
    onError: e => toast.error(e.message),
  });

  const detectedPlatform = detect.data?.platform ?? null;
  const detectedFormat   = detect.data?.format   ?? null;

  const effectivePlatform = lockPlatformFormat ? (defaultPlatform ?? '') : (platform || detectedPlatform || '');
  const effectiveFormat   = lockPlatformFormat ? (defaultFormat   ?? '') : (format   || detectedFormat   || '');

  const subBucketOptions = bucket ? SUB_BUCKETS[bucket] : undefined;

  function handleBucketChange(val: string) {
    setBucket(val);
    setSubBucket('');
  }

  function handleSingleAdd() {
    createPost.mutate({
      post_url:       url,
      platform:       (effectivePlatform || undefined) as typeof PLATFORMS[number] | undefined,
      format:         (effectiveFormat   || undefined) as typeof FORMATS[number]   | undefined,
      content_bucket: bucket          || undefined,
      sub_bucket:     subBucket       || undefined,
      campaign:       campaign        || undefined,
      tags:           tags            || undefined,
      target_company: targetCompany   || undefined,
    });
  }

  function handleBulkAdd() {
    const urls = bulkText.split('\n').map(s => s.trim()).filter(Boolean);
    if (urls.length === 0) { toast.error('No URLs found'); return; }
    bulkCreate.mutate({ urls });
  }

  function resetAndClose() {
    setUrl(''); setPlatform(''); setFormat('');
    setBucket(''); setSubBucket(''); setCampaign(''); setTags(''); setBulkText('');
    setTargetCompany('');
    onClose();
  }

  const isBusy = createPost.isPending || bulkCreate.isPending;

  return (
    <Dialog.Root open={open} onOpenChange={v => !v && resetAndClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-xl p-6 w-full max-w-lg">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-base font-semibold text-gray-900">
              {lockPlatformFormat ? `Add ${defaultFormat ?? 'Post'}` : 'Add Post'}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </Dialog.Close>
          </div>

          <Tabs.Root defaultValue="single">
            {!lockPlatformFormat && (
              <Tabs.List className="flex gap-1 mb-4 border-b border-gray-100">
                {['single', 'bulk'].map(tab => (
                  <Tabs.Trigger
                    key={tab}
                    value={tab}
                    className="px-3 py-1.5 text-sm capitalize text-gray-500 data-[state=active]:text-brand-600 data-[state=active]:border-b-2 data-[state=active]:border-brand-600 -mb-px"
                  >
                    {tab}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
            )}

            {/* Single */}
            <Tabs.Content value="single" className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Post URL *</label>
                <input
                  type="url"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://www.instagram.com/p/..."
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                />
                {!lockPlatformFormat && detectedPlatform && (
                  <p className="text-xs text-brand-600 mt-1">
                    Detected: {detectedPlatform} · {detectedFormat ?? 'unknown format'}
                  </p>
                )}
              </div>

              {lockPlatformFormat ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Platform</label>
                    <div className="w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                      {defaultPlatform}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Format</label>
                    <div className="w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                      {defaultFormat}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Platform</label>
                    <select
                      value={effectivePlatform}
                      onChange={e => setPlatform(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                    >
                      <option value="">Auto-detect</option>
                      {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Format</label>
                    <select
                      value={effectiveFormat}
                      onChange={e => setFormat(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                    >
                      <option value="">Auto-detect</option>
                      {FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Campaign</label>
                <input
                  type="text"
                  value={campaign}
                  onChange={e => setCampaign(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={tags}
                  onChange={e => setTags(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Target Company <span className="text-gray-400 font-normal">(optional — detects if post mentions this brand)</span>
                </label>
                <input
                  type="text"
                  value={targetCompany}
                  onChange={e => setTargetCompany(e.target.value)}
                  placeholder="e.g. Grapes Worldwide"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Bucket</label>
                <select
                  value={bucket}
                  onChange={e => handleBucketChange(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                >
                  <option value="">— None —</option>
                  {Object.keys(SUB_BUCKETS).map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>

              {bucket && subBucketOptions && (
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Sub-bucket</label>
                  {subBucketOptions === 'freetext' ? (
                    <input
                      type="text"
                      value={subBucket}
                      onChange={e => setSubBucket(e.target.value)}
                      placeholder="Enter sub-bucket..."
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                    />
                  ) : (
                    <select
                      value={subBucket}
                      onChange={e => setSubBucket(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                    >
                      <option value="">— Select sub-bucket —</option>
                      {subBucketOptions.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={resetAndClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:text-gray-800">
                  Cancel
                </button>
                <button
                  onClick={handleSingleAdd}
                  disabled={!url || isBusy}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-60"
                >
                  {isBusy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Add &amp; Scrape
                </button>
              </div>
            </Tabs.Content>

            {/* Bulk */}
            {!lockPlatformFormat && (
              <Tabs.Content value="bulk" className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">URLs (one per line)</label>
                  <textarea
                    value={bulkText}
                    onChange={e => setBulkText(e.target.value)}
                    rows={8}
                    placeholder="https://www.instagram.com/p/abc...&#10;https://www.youtube.com/watch?v=xyz..."
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-300 resize-none"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    {bulkText.split('\n').filter(s => s.trim()).length} URLs detected
                  </p>
                </div>

                <div className="flex justify-end gap-2">
                  <button onClick={resetAndClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:text-gray-800">
                    Cancel
                  </button>
                  <button
                    onClick={handleBulkAdd}
                    disabled={!bulkText.trim() || isBusy}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-60"
                  >
                    {isBusy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    Add All
                  </button>
                </div>
              </Tabs.Content>
            )}
          </Tabs.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
