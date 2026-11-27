import { getApiBaseUrl } from './config';

export type DemoSessionInfo = {
  ok: true;
  demo: true;
  hasKey: boolean;
  apiKey: string | null;
  keyHint: string | null;
  keyCreatedAt: number | null;
  gatewayUrl: string;
  expiresAt: string;
  remainingSeconds: number;
  requestsUsed: number;
  requestsRemaining: number;
  limits: {
    ttlSeconds: number;
    maxRequests: number;
    maxRequestsPerMinute: number;
  };
};

async function readJson(res: Response) {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const error: any = new Error(body?.message || `HTTP ${res.status}`);
    error.status = res.status;
    error.code = body?.code;
    throw error;
  }
  return body;
}

/** Returns the demo session for this tab, or null when not running in demo mode. */
export async function fetchDemoSession(): Promise<DemoSessionInfo | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/admin/session`, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!res.ok) return null;
    const body = (await res.json()) as DemoSessionInfo;
    return body?.demo ? body : null;
  } catch {
    return null;
  }
}

export async function generateDemoKey(): Promise<{ apiKey: string; gatewayUrl: string }> {
  const res = await fetch(`${getApiBaseUrl()}/admin/session/key`, {
    method: 'POST',
    credentials: 'same-origin',
  });
  return readJson(res);
}

export async function revokeDemoKey(): Promise<void> {
  const res = await fetch(`${getApiBaseUrl()}/admin/session/key`, {
    method: 'DELETE',
    credentials: 'same-origin',
  });
  await readJson(res);
}

export async function resetDemoSession(): Promise<DemoSessionInfo> {
  const res = await fetch(`${getApiBaseUrl()}/admin/session/reset`, {
    method: 'POST',
    credentials: 'same-origin',
  });
  return readJson(res);
}
