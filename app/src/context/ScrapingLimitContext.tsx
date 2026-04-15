'use client';

import { createContext, useContext } from 'react';
import { trpc } from '../lib/trpc';

interface ScrapingLimitContextValue {
  disabled: boolean;
  dismiss: () => void;
  dismissing: boolean;
}

const ScrapingLimitContext = createContext<ScrapingLimitContextValue>({
  disabled: false,
  dismiss: () => {},
  dismissing: false,
});

export function ScrapingLimitProvider({ children }: { children: React.ReactNode }) {
  const query = trpc.scrape.getUsageLimit.useQuery(undefined, { refetchInterval: 30_000 });
  const clear = trpc.scrape.clearUsageLimit.useMutation({ onSuccess: () => query.refetch() });

  return (
    <ScrapingLimitContext.Provider value={{
      disabled: query.data?.hit ?? false,
      dismiss: () => clear.mutate(),
      dismissing: clear.isPending,
    }}>
      {children}
    </ScrapingLimitContext.Provider>
  );
}

export const useScrapingLimit = () => useContext(ScrapingLimitContext);
