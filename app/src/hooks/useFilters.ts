'use client';

import { useState, useCallback } from 'react';
import type { Filters } from '../types';

const EMPTY: Filters = {};

export function useFilters() {
  const [filters, setFilters] = useState<Filters>(EMPTY);

  const set = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters(prev => {
      if (value === '' || value === undefined) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: value };
    });
  }, []);

  const reset = useCallback(() => setFilters(EMPTY), []);

  return { filters, set, reset };
}
