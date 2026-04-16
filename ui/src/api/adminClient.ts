export type ProviderId = string;

export type ProviderSummary = {
  provider: ProviderId;
  apiKeyMasked?: string;
  organizationId?: string;
  projectId?: string;
  budgetUSD?: number;
  status?: 'connected' | 'disconnected' | 'unknown';
  lastSyncedAt?: string;
};

export type ProviderUpdateRequest = {
  apiKey?: string;
  organizationId?: string;
  projectId?: string;
  budgetUSD?: number;
};

export type UsageByModel = {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  requests?: number;
  costUSD?: number;
};

export type UsageTotals = {
  costUSD?: number;
  inputTokens?: number;
  outputTokens?: number;
  requests?: number;
};

export type UsageResponse = {
  provider?: ProviderId;
  from?: string;
  to?: string;
  totals?: UsageTotals;
  byModel?: UsageByModel[];
};

const ADMIN_TOKEN_KEY = 'adminToken';

function getAdminToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY) ?? '';
}

async function adminFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers instanceof Headers
      ? Object.fromEntries(options.headers.entries())
      : (options?.headers as Record<string, string> | undefined) ?? {}),
  };

  const token = getAdminToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(path, {
    ...options,
    headers,
  });

  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    // ignore non-json responses
  }

  if (!res.ok) {
    const msg =
      payload?.message ||
      payload?.error ||
      payload?.status ||
      `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return payload as T;
}

export async function getProviders(): Promise<{
  providers: ProviderSummary[];
}> {
  return adminFetch<{ providers: ProviderSummary[] }>('/admin/providers');
}

export async function updateProvider(
  provider: ProviderId,
  req: ProviderUpdateRequest
): Promise<{ ok: boolean; provider?: ProviderSummary }> {
  return adminFetch<{ ok: boolean; provider?: ProviderSummary }>(
    `/admin/providers/${encodeURIComponent(provider)}`,
    {
      method: 'PUT',
      body: JSON.stringify(req),
    }
  );
}

export async function getUsage(params: {
  provider?: ProviderId;
  from: string;
  to: string;
}): Promise<UsageResponse> {
  const u = new URL('/admin/usage', window.location.origin);
  u.searchParams.set('from', params.from);
  u.searchParams.set('to', params.to);
  if (params.provider && params.provider !== 'all') {
    u.searchParams.set('provider', params.provider);
  }

  // Keep it relative for Vite proxy.
  const qs = u.searchParams.toString();
  const relativePath = qs ? `${u.pathname}?${qs}` : u.pathname;
  return adminFetch<UsageResponse>(relativePath, { method: 'GET' });
}

export function setAdminToken(token: string) {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}
