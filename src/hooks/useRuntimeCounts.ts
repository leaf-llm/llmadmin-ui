import { useEffect, useRef, useState } from 'react';
import { getApiBaseUrl } from '../api/config';
import { getAdminToken } from '../api/adminClient';

export type RuntimeCounts = {
  success: number;
  failure: number;
  total: number;
};

const EMPTY_COUNTS: RuntimeCounts = { success: 0, failure: 0, total: 0 };

/**
 * Subscribe to the gateway's lightweight counts stream.
 *
 * EventSource cannot attach an Authorization header, so we use fetch() with a
 * ReadableStream and parse the SSE framing ourselves. This also lets us stop
 * reconnecting on 401 and hand control back to the login gate.
 */
export function useRuntimeCounts(): RuntimeCounts {
  const [counts, setCounts] = useState<RuntimeCounts>(EMPTY_COUNTS);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const scheduleReconnect = () => {
      if (cancelled) return;
      attempt += 1;
      const delay = Math.min(1000 * 2 ** Math.min(attempt, 5), 30000);
      retryTimer = setTimeout(connect, delay);
    };

    const handleEvent = (event: string, data: string) => {
      if (event !== 'counts') return;
      try {
        const parsed = JSON.parse(data);
        if (
          typeof parsed?.success === 'number' &&
          typeof parsed?.failure === 'number'
        ) {
          attempt = 0;
          setCounts({
            success: parsed.success,
            failure: parsed.failure,
            total:
              typeof parsed.total === 'number'
                ? parsed.total
                : parsed.success + parsed.failure,
          });
        }
      } catch {
        // Ignore malformed payloads — the next event resyncs.
      }
    };

    const connect = async () => {
      if (cancelled) return;
      const controller = new AbortController();
      abortRef.current = controller;
      const token = getAdminToken();
      const baseUrl = getApiBaseUrl();

      try {
        const res = await fetch(`${baseUrl}/log/stream?type=counts`, {
          signal: controller.signal,
          credentials: 'same-origin',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (res.status === 401) {
          controller.abort();
          window.dispatchEvent(new CustomEvent('llmadmin:unauthorized'));
          return;
        }
        if (!res.ok || !res.body) {
          throw new Error(`counts stream HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let eventName = 'message';
        let eventData: string[] = [];

        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let newline = buffer.indexOf('\n');
          while (newline >= 0) {
            const line = buffer.slice(0, newline).replace(/\r$/, '');
            buffer = buffer.slice(newline + 1);
            newline = buffer.indexOf('\n');

            if (line === '') {
              if (eventData.length) {
                handleEvent(eventName, eventData.join('\n'));
              }
              eventName = 'message';
              eventData = [];
              continue;
            }
            if (line.startsWith(':')) continue;
            if (line.startsWith('event:')) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              eventData.push(line.slice(5).trimStart());
            }
          }
        }
        if (!cancelled) scheduleReconnect();
      } catch (err: any) {
        if (cancelled || err?.name === 'AbortError') return;
        scheduleReconnect();
      }
    };

    void connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  return counts;
}
