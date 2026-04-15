'use client';

import { Link2, Check } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export function ShareButton() {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy link');
    }
  }

  return (
    <button
      onClick={handleShare}
      className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:border-indigo-300 hover:text-indigo-700 transition-colors print:hidden"
    >
      {copied ? <Check size={14} className="text-green-500" /> : <Link2 size={14} />}
      {copied ? 'Copied!' : 'Share'}
    </button>
  );
}
