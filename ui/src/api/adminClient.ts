export type ProviderId = string;

export const SUPPORTED_PROVIDERS: ProviderId[] = [
  'openai',
  'anthropic',
  'google',
  'zhipu',
  'dashscope',
  'moonshot',
  'minimax',
  'doubao',
  'deepseek',
];

export type RoutingEntry = {
  provider: ProviderId;
  model: string;
  configId: string;
  isPrimary?: boolean;
};

export type ProviderSummary = {
  provider: ProviderId;
  apiKeyMasked?: string;
  baseUrl?: string;
  status?: 'connected' | 'disconnected' | 'unknown';
  lastSyncedAt?: string;
  isPrimary?: boolean;
  routing?: RoutingEntry[];
  remark?: string;
  configCount: number;
  configId?: string;
  apiFormat?: 'openai' | 'anthropic';
};

export type ProviderUpdateRequest = {
  apiKey?: string;
  baseUrl?: string;
  setAsPrimary?: boolean;
  remark?: string;
  configId?: string;
  apiFormat?: 'openai' | 'anthropic';
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

export async function getProviders(category?: string): Promise<{
  providers: ProviderSummary[];
}> {
  const u = new URL('/admin/providers', window.location.origin);
  if (category) {
    u.searchParams.set('category', category);
  }
  const qs = u.searchParams.toString();
  const path = qs ? `${u.pathname}?${qs}` : u.pathname;
  const res = await adminFetch<{ providers: ProviderSummary[] }>(path);
  return res;
}

export async function updateProvider(
  category: string,
  provider: ProviderId,
  req: ProviderUpdateRequest
): Promise<{ ok: boolean; provider?: ProviderSummary }> {
  const u = new URL(
    `/admin/providers/${encodeURIComponent(provider)}`,
    window.location.origin
  );
  u.searchParams.set('category', category);
  const res = await adminFetch<{ ok: boolean; provider?: ProviderSummary }>(
    u.pathname + u.search,
    {
      method: 'PUT',
      body: JSON.stringify(req),
    }
  );
  return res;
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

export type UserConfig = Record<string, unknown> | null;

export async function getConfig(
  category?: string
): Promise<{ config: UserConfig }> {
  const u = new URL('/admin/config', window.location.origin);
  if (category) {
    u.searchParams.set('category', category);
  }
  const qs = u.searchParams.toString();
  const path = qs ? `${u.pathname}?${qs}` : u.pathname;
  return adminFetch<{ config: UserConfig }>(path);
}

export async function syncConfig(category?: string): Promise<{
  ok: boolean;
  config?: Record<string, unknown>;
}> {
  const u = new URL('/admin/config', window.location.origin);
  if (category) {
    u.searchParams.set('category', category);
  }
  const qs = u.searchParams.toString();
  const path = qs ? `${u.pathname}?${qs}` : u.pathname;
  return adminFetch<{ ok: boolean; config?: Record<string, unknown> }>(path, {
    method: 'POST',
  });
}

export async function deleteConfig(
  category?: string
): Promise<{ ok: boolean }> {
  const u = new URL('/admin/config', window.location.origin);
  if (category) {
    u.searchParams.set('category', category);
  }
  const qs = u.searchParams.toString();
  const path = qs ? `${u.pathname}?${qs}` : u.pathname;
  return adminFetch<{ ok: boolean }>(path, {
    method: 'DELETE',
  });
}

export async function exportConfig(): Promise<Record<string, unknown>> {
  const u = new URL('/admin/config/export', window.location.origin);
  const res = await adminFetch<{
    config?: Record<string, unknown>;
    ok?: boolean;
    message?: string;
  }>(u.pathname);
  if (!res.config) {
    throw new Error(res.message || 'Failed to export config');
  }
  return res.config;
}

export async function importConfig(
  config: Record<string, unknown>
): Promise<{ ok: boolean; message?: string }> {
  return adminFetch<{ ok: boolean; message?: string }>('/admin/config/import', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

export async function getRouting(category?: string): Promise<{
  routing: RoutingEntry[];
}> {
  const u = new URL('/admin/routing', window.location.origin);
  if (category) {
    u.searchParams.set('category', category);
  }
  const qs = u.searchParams.toString();
  const path = qs ? `${u.pathname}?${qs}` : u.pathname;
  return adminFetch<{ routing: RoutingEntry[] }>(path);
}

export async function addRoutingModel(
  category: string,
  provider: ProviderId,
  model: string,
  configId: string,
  isPrimary?: boolean
): Promise<{ ok: boolean; routing: RoutingEntry[] }> {
  const u = new URL(
    `/admin/routing/${encodeURIComponent(provider)}/${encodeURIComponent(model)}`,
    window.location.origin
  );
  u.searchParams.set('category', category);
  return adminFetch<{ ok: boolean; routing: RoutingEntry[] }>(
    u.pathname + u.search,
    {
      method: 'POST',
      body: JSON.stringify({ configId, isPrimary }),
    }
  );
}

export async function updateRoutingPrimary(
  category: string,
  provider: ProviderId,
  model: string,
  configId: string,
  isPrimary: boolean
): Promise<{ ok: boolean; routing: RoutingEntry[] }> {
  const u = new URL(
    `/admin/routing/${encodeURIComponent(provider)}/${encodeURIComponent(model)}`,
    window.location.origin
  );
  u.searchParams.set('category', category);
  return adminFetch<{ ok: boolean; routing: RoutingEntry[] }>(
    u.pathname + u.search,
    {
      method: 'PUT',
      body: JSON.stringify({ configId, isPrimary }),
    }
  );
}

export async function removeRoutingModel(
  category: string,
  provider: ProviderId,
  model: string,
  configId?: string
): Promise<{ ok: boolean; routing: RoutingEntry[] }> {
  const u = new URL(
    `/admin/routing/${encodeURIComponent(provider)}/${encodeURIComponent(model)}`,
    window.location.origin
  );
  u.searchParams.set('category', category);
  if (configId) {
    u.searchParams.set('configId', configId);
  }
  return adminFetch<{ ok: boolean; routing: RoutingEntry[] }>(
    u.pathname + u.search,
    { method: 'DELETE' }
  );
}

export type ProviderModelsResponse = {
  object?: string;
  data?: Array<{
    id?: string;
    object?: string;
    created?: number;
    owned_by?: string;
  }>;
};

export async function getProviderModels(
  provider: ProviderId,
  configId: string
): Promise<ProviderModelsResponse> {
  const u = new URL('/admin/provider-models', window.location.origin);
  u.searchParams.set('provider', provider);
  u.searchParams.set('configId', configId);
  const qs = u.searchParams.toString();
  const path = qs ? `${u.pathname}?${qs}` : u.pathname;
  return adminFetch<ProviderModelsResponse>(path);
}

export async function deleteProviderConfig(
  category: string,
  provider: ProviderId,
  configId: string
): Promise<{ ok: boolean }> {
  const u = new URL(
    `/admin/providers/${encodeURIComponent(provider)}/config/${encodeURIComponent(configId)}`,
    window.location.origin
  );
  u.searchParams.set('category', category);
  return adminFetch<{ ok: boolean }>(u.pathname + u.search, {
    method: 'DELETE',
  });
}

export type TestConnectivityResponse = {
  ok: boolean;
  message?: string;
  apiFormat?: 'openai' | 'anthropic';
};

export async function testProviderConnectivity(
  provider: ProviderId,
  params: { apiKey: string; baseUrl?: string; configId?: string }
): Promise<TestConnectivityResponse> {
  const u = new URL(
    `/admin/providers/${encodeURIComponent(provider)}/test-connectivity`,
    window.location.origin
  );
  return adminFetch<TestConnectivityResponse>(u.pathname, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}
