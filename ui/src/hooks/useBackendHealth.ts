import { useState, useEffect, useCallback, useRef } from 'react';
import { isDesktopMode, getApiBaseUrl } from '../api/config';

export type BackendStatus = 'connecting' | 'connected' | 'error';

const HEALTHY_INTERVAL_MS = 10000;
const BASE_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 30000;
const MAX_RETRY_COUNT = 15;
const HEALTH_TIMEOUT_MS = 3000;

export function useBackendHealth() {
  const [status, setStatus] = useState<BackendStatus>('connecting');
  const retryCountRef = useRef(0);
  const mountedRef = useRef(true);
  const pollingRef = useRef(false);

  const checkHealth = useCallback(async (): Promise<boolean> => {
    try {
      const baseUrl = getApiBaseUrl();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
      const res = await fetch(`${baseUrl}/admin/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        if (mountedRef.current) {
          retryCountRef.current = 0;
          setStatus('connected');
        }
        return true;
      }
    } catch {
      // backend not reachable
    }
    return false;
  }, []);

  const waitFor = (ms: number): Promise<void> =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      const check = setInterval(() => {
        if (!mountedRef.current) {
          clearTimeout(timer);
          clearInterval(check);
          resolve();
        }
      }, 500);
      setTimeout(() => clearInterval(check), ms + 100);
    });

  useEffect(() => {
    mountedRef.current = true;

    if (pollingRef.current) return;
    pollingRef.current = true;

    let stopped = false;

    const poll = async () => {
      while (!stopped && mountedRef.current) {
        const ok = await checkHealth();
        if (stopped) break;

        if (ok) {
          retryCountRef.current = 0;
          if (mountedRef.current) setStatus('connected');
          await waitFor(HEALTHY_INTERVAL_MS);
        } else {
          retryCountRef.current++;
          if (retryCountRef.current > MAX_RETRY_COUNT) {
            if (mountedRef.current) setStatus('error');
            break;
          }
          const delay = Math.min(
            BASE_RETRY_DELAY_MS *
              Math.pow(2, Math.min(retryCountRef.current - 1, 5)),
            MAX_RETRY_DELAY_MS
          );
          await waitFor(delay);
        }
      }
      pollingRef.current = false;
    };

    poll();

    return () => {
      stopped = true;
      mountedRef.current = false;
    };
  }, [checkHealth]);

  const retry = useCallback(() => {
    retryCountRef.current = 0;
    setStatus('connecting');
    mountedRef.current = true;
    if (!pollingRef.current) {
      pollingRef.current = true;
      let stopped = false;

      const poll = async () => {
        while (!stopped && mountedRef.current) {
          const ok = await checkHealth();
          if (stopped) break;

          if (ok) {
            retryCountRef.current = 0;
            if (mountedRef.current) setStatus('connected');
            await waitFor(HEALTHY_INTERVAL_MS);
          } else {
            retryCountRef.current++;
            if (retryCountRef.current > MAX_RETRY_COUNT) {
              if (mountedRef.current) setStatus('error');
              break;
            }
            const delay = Math.min(
              BASE_RETRY_DELAY_MS *
                Math.pow(2, Math.min(retryCountRef.current - 1, 5)),
              MAX_RETRY_DELAY_MS
            );
            await waitFor(delay);
          }
        }
        pollingRef.current = false;
      };
      poll();
    }
  }, [checkHealth]);

  return { status, retry };
}
