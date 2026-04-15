'use client';

import { useEffect } from 'react';

interface Shortcuts {
  onAddPost?: () => void;
  onExport?: () => void;
  onScrapeAll?: () => void;
}

export function useKeyboardShortcuts({ onAddPost, onExport, onScrapeAll }: Shortcuts) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'n':
            e.preventDefault();
            onAddPost?.();
            break;
          case 'e':
            e.preventDefault();
            onExport?.();
            break;
          case 'r':
            e.preventDefault();
            onScrapeAll?.();
            break;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onAddPost, onExport, onScrapeAll]);
}
