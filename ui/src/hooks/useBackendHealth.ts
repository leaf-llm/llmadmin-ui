import { useState, useEffect, useCallback, useRef } from 'react';
import { isDesktopMode, getApiBaseUrl } from '../api/config';

export type BackendStatus = 'connecting' | 'connected' | 'error';

export function useBackendHealth() {
  const [status, setStatus] = useState<BackendStatus>(() =>
    isDesktopMode() ? 'connecting' : 'connected'
  );
  const retryCountRef = useRef(0);
  const mountedRef = useRef(true);
  const pollingRef = useRef(false);

  const checkHealth = useCallback(async () => {
    try {
      const baseUrl = getApiBaseUrl();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
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
      // backend not ready
    }
    return false;
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    if (!isDesktopMode()) {
      setStatus('connected');
      return;
    }

    if (pollingRef.current) return;
    pollingRef.current = true;

    let stopped = false;

    const poll = async () => {
      while (!stopped && mountedRef.current) {
        const ok = await checkHealth();
        if (ok || stopped) break;

        retryCountRef.current++;
        if (retryCountRef.current > 15) {
          if (mountedRef.current) setStatus('error');
          break;
        }

        const delay = Math.min(
          500 * Math.pow(2, Math.min(retryCountRef.current - 1, 4)),
          5000
        );
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, delay);
          const check = setInterval(() => {
            if (!mountedRef.current) {
              clearTimeout(timer);
              clearInterval(check);
              resolve();
            }
          }, 500);
          setTimeout(() => clearInterval(check), delay + 100);
        });
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
    // Re-trigger polling
    mountedRef.current = true;
    if (!pollingRef.current) {
      pollingRef.current = true;
      let stopped = false;
      const poll = async () => {
        while (!stopped && mountedRef.current) {
          const ok = await checkHealth();
          if (ok || stopped) break;
          retryCountRef.current++;
          if (retryCountRef.current > 15) {
            if (mountedRef.current) setStatus('error');
            break;
          }
          const delay = Math.min(
            500 * Math.pow(2, Math.min(retryCountRef.current - 1, 4)),
            5000
          );
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, delay);
          });
        }
        pollingRef.current = false;
      };
      poll();
    }
  }, [checkHealth]);

  return { status, retry };
}
