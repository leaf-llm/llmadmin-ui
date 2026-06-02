import { useEffect, useRef, useState } from 'react';
import { getApiBaseUrl } from '../api/config';

export type RuntimeCounts = {
  success: number;
  failure: number;
  total: number;
};

const EMPTY_COUNTS: RuntimeCounts = { success: 0, failure: 0, total: 0 };

export function useRuntimeCounts(): RuntimeCounts {
  const [counts, setCounts] = useState<RuntimeCounts>(EMPTY_COUNTS);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let cancelled = false;

    const open = () => {
      if (cancelled) return;
      const baseUrl = getApiBaseUrl();
      const url = `${baseUrl}/log/stream?type=counts`;
      const es = new EventSource(url);
      sourceRef.current = es;

      es.addEventListener('counts', (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data);
          if (
            typeof data?.success === 'number' &&
            typeof data?.failure === 'number'
          ) {
            setCounts({
              success: data.success,
              failure: data.failure,
              total:
                typeof data.total === 'number'
                  ? data.total
                  : data.success + data.failure,
            });
          }
        } catch {
          // Ignore malformed payloads — the next event will resync.
        }
      });

      es.onerror = () => {
        // EventSource auto-reconnects on transient errors. If the server
        // is gone for good, the browser will keep retrying with backoff.
        // We only close the source on unmount; no manual reconnect loop needed.
      };
    };

    open();

    return () => {
      cancelled = true;
      sourceRef.current?.close();
      sourceRef.current = null;
    };
  }, []);

  return counts;
}
