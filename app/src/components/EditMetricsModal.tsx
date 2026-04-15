'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '../lib/trpc';
import type { PostWithMetrics } from '../types';

interface Props {
  post: PostWithMetrics;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditMetricsModal({ post, open, onClose, onSuccess }: Props) {
  const [impressions, setImpressions] = useState(post.metrics?.impressions?.toString() ?? '');
  const [reach, setReach]             = useState(post.metrics?.reach?.toString() ?? '');
  const [clicks, setClicks]           = useState(post.metrics?.clicks?.toString() ?? '');

  const mutation = trpc.posts.updateMetrics.useMutation({
    onSuccess: () => {
      toast.success('Metrics updated');
      onSuccess();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  function handleSave() {
    const parsed = {
      impressions: impressions !== '' ? parseInt(impressions, 10) : undefined,
      reach:       reach       !== '' ? parseInt(reach, 10)       : undefined,
      clicks:      clicks      !== '' ? parseInt(clicks, 10)      : undefined,
    };
    const hasNegative = Object.values(parsed).some(v => v !== undefined && (isNaN(v) || v < 0));
    if (hasNegative) {
      toast.error('Metrics must be non-negative whole numbers');
      return;
    }
    mutation.mutate({ post_id: post.id, ...parsed });
  }

  return (
    <Dialog.Root open={open} onOpenChange={v => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-base font-semibold text-gray-900">Edit Tier 2 Metrics</Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </Dialog.Close>
          </div>

          <p className="text-xs text-gray-500 mb-4 truncate">{post.post_url}</p>

          <div className="space-y-3">
            {[
              { label: 'Impressions', value: impressions, set: setImpressions },
              { label: 'Reach',       value: reach,       set: setReach },
              { label: 'Clicks',      value: clicks,      set: setClicks },
            ].map(({ label, value, set }) => (
              <div key={label}>
                <label className="text-xs font-medium text-gray-600 block mb-1">{label}</label>
                <input
                  type="number"
                  min={0}
                  value={value}
                  onChange={e => set(e.target.value)}
                  placeholder="Leave blank to keep existing"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg border border-gray-200">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={mutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-60"
            >
              {mutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
