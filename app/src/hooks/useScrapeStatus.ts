'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { ScrapeStatusEvent } from '../types';

export function useScrapeStatus(onEvent?: (event: ScrapeStatusEvent) => void) {
  const [scrapingPostIds, setScrapingPostIds] = useState<Set<string>>(new Set());
  const [lastEvent, setLastEvent] = useState<ScrapeStatusEvent | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL?.replace(/\/$/, '');
    const url = workerUrl
      ? `${workerUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')}/ws`
      : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        const event: ScrapeStatusEvent = JSON.parse(e.data as string);
        setLastEvent(event);
        onEventRef.current?.(event);

        if (event.type === 'scraping') {
          setScrapingPostIds(prev => {
            const next = new Set(prev);
            event.postIds.forEach(id => next.add(id));
            return next;
          });
        } else {
          setScrapingPostIds(prev => {
            const next = new Set(prev);
            event.postIds.forEach(id => next.delete(id));
            return next;
          });
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      // Reconnect after 3 seconds
      setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  return { scrapingPostIds, lastEvent };
}
