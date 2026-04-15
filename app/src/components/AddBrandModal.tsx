'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X, Loader2, Building2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '../lib/trpc';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  fromDate?: string;
  toDate?: string;
}

const PLATFORM_HINTS: Record<string, { label: string; color: string }> = {
  Instagram: { label: 'Instagram', color: 'text-pink-600 bg-pink-50 border-pink-200' },
  Facebook:  { label: 'Facebook',  color: 'text-blue-600 bg-blue-50 border-blue-200' },
  LinkedIn:  { label: 'LinkedIn',  color: 'text-sky-700 bg-sky-50 border-sky-200' },
};

function detectPlatform(url: string): string | null {
  if (/instagram\.com/i.test(url)) return 'Instagram';
  if (/facebook\.com/i.test(url)) return 'Facebook';
  if (/linkedin\.com\/company/i.test(url)) return 'LinkedIn';
  return null;
}

export function AddBrandModal({ open, onClose, onSuccess, fromDate, toDate }: Props) {
  const [url, setUrl]   = useState('');
  const [name, setName] = useState('');

  const detectedPlatform = url.length > 5 ? detectPlatform(url) : null;
  const platformHint = detectedPlatform ? PLATFORM_HINTS[detectedPlatform] : null;

  const createBrand = trpc.brands.create.useMutation({
    onSuccess: (data) => {
      if (data.alreadyExists) {
        toast.info('This brand is already tracked.');
      } else {
        toast.success('Brand added! Scraping started in the background.');
        onSuccess();
        resetAndClose();
      }
    },
    onError: e => toast.error(e.message),
  });

  function resetAndClose() {
    setUrl('');
    setName('');
    onClose();
  }

  function handleSubmit() {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;
    if (!detectedPlatform) {
      toast.error('Unsupported platform. Paste an Instagram, Facebook, or LinkedIn company URL.');
      return;
    }
    createBrand.mutate({
      profile_url: trimmedUrl,
      name: name.trim() || undefined,
      from_date: fromDate,
      to_date: toDate,
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={v => { if (!v) resetAndClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl focus:outline-none">
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="flex items-center gap-2 text-base font-semibold text-gray-900">
              <Building2 size={18} className="text-brand-600" />
              Add Brand
            </Dialog.Title>
            <Dialog.Close asChild>
              <button onClick={resetAndClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          <div className="space-y-4">
            {/* Profile URL */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Profile URL</label>
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://www.instagram.com/yourbrand/"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-300"
                autoFocus
              />
              {platformHint && (
                <span className={`mt-1.5 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${platformHint.color}`}>
                  {platformHint.label} detected
                </span>
              )}
              {url.length > 5 && !detectedPlatform && (
                <p className="mt-1 text-xs text-amber-600">
                  Supported: Instagram, Facebook Page, or LinkedIn Company URL
                </p>
              )}
            </div>

            {/* Name override */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Brand Name <span className="text-gray-400 font-normal">(optional — auto-detected from handle)</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Grapes Worldwide"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-300"
              />
            </div>

            <p className="text-xs text-gray-400">
              Scraping posts from {fromDate ?? 'last 6 months'} to {toDate ?? 'today'}.
            </p>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button
              onClick={resetAndClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!url.trim() || !detectedPlatform || createBrand.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {createBrand.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
              Add Brand
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
