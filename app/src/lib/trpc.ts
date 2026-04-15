'use client';

import { createTRPCReact } from '@trpc/react-query';
import { httpLink } from '@trpc/client';
import type { AppRouter } from '../../../worker/src/server/routers/index';

export const trpc = createTRPCReact<AppRouter>();

export function makeTrpcClient() {
  // AI-backed insight routes can take longer than ordinary CRUD queries in dev.
  const requestTimeoutMs = 45000;
  const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL?.replace(/\/$/, '');
  const trpcUrl = workerUrl ? `${workerUrl}/trpc` : '/trpc';

  const apiKey = process.env.NEXT_PUBLIC_API_KEY ?? '';

  return trpc.createClient({
    links: [
      httpLink({
        url: trpcUrl,
        headers: () => ({ 'x-api-key': apiKey }),
        fetch: async (input, init) => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

          try {
            return await fetch(input, { ...init, signal: init?.signal ?? controller.signal });
          } finally {
            clearTimeout(timeout);
          }
        },
      }),
    ],
  });
}
