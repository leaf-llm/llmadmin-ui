import { getApiBaseUrl } from './config';

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
  apiKeyUrl?: string;
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

export type MetricsResponse = {
  from: string;
  to: string;
  totals: {
    totalRequests: number;
    successCount: number;
    failureCount: number;
    inputTokens: number;
    outputTokens: number;
  };
  daily: Array<{
    date: string;
    provider: string;
    totalRequests: number;
    successCount: number;
    failureCount: number;
    inputTokens: number;
    outputTokens: number;
  }>;
};

const ADMIN_TOKEN_KEY = 'adminToken';
const REQUEST_TIMEOUT_MS = 5000;
const MAX_RETRIES = 2;

function getAdminToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY) ?? '';
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function adminFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const url = baseUrl + path;

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

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers,
      });
      clearTimeout(timeout);

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
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError' || err instanceof TypeError) {
        if (attempt < MAX_RETRIES) {
          await sleep(1000 * (attempt + 1));
          continue;
        }
        throw new Error(
          'Backend is not responding. Please wait for the gateway to start.'
        );
      }
      throw err;
    }
  }

  throw new Error('Max retries exceeded');
}

export async function getProviders(category?: string): Promise<{
  providers: ProviderSummary[];
}> {
  const qs = category ? `?category=${encodeURIComponent(category)}` : '';
  return adminFetch<{ providers: ProviderSummary[] }>(`/admin/providers${qs}`);
}

export async function updateProvider(
  category: string,
  provider: ProviderId,
  req: ProviderUpdateRequest
): Promise<{ ok: boolean; provider?: ProviderSummary }> {
  const qs = `?category=${encodeURIComponent(category)}`;
  return adminFetch<{ ok: boolean; provider?: ProviderSummary }>(
    `/admin/providers/${encodeURIComponent(provider)}${qs}`,
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
  const sp = new URLSearchParams();
  sp.set('from', params.from);
  sp.set('to', params.to);
  if (params.provider && params.provider !== 'all') {
    sp.set('provider', params.provider);
  }
  const qs = sp.toString();
  return adminFetch<UsageResponse>(`/admin/usage${qs ? `?${qs}` : ''}`, {
    method: 'GET',
  });
}

export async function getMetrics(params: {
  from: string;
  to: string;
}): Promise<MetricsResponse> {
  const sp = new URLSearchParams();
  sp.set('from', params.from);
  sp.set('to', params.to);
  const qs = sp.toString();
  return adminFetch<MetricsResponse>(`/admin/metrics${qs ? `?${qs}` : ''}`);
}

export function setAdminToken(token: string) {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export type UserConfig = Record<string, unknown> | null;

export async function getConfig(
  category?: string
): Promise<{ config: UserConfig }> {
  const qs = category ? `?category=${encodeURIComponent(category)}` : '';
  return adminFetch<{ config: UserConfig }>(`/admin/config${qs}`);
}

export async function syncConfig(category?: string): Promise<{
  ok: boolean;
  config?: Record<string, unknown>;
}> {
  const qs = category ? `?category=${encodeURIComponent(category)}` : '';
  return adminFetch<{ ok: boolean; config?: Record<string, unknown> }>(
    `/admin/config${qs}`,
    {
      method: 'POST',
    }
  );
}

export async function deleteConfig(
  category?: string
): Promise<{ ok: boolean }> {
  const qs = category ? `?category=${encodeURIComponent(category)}` : '';
  return adminFetch<{ ok: boolean }>(`/admin/config${qs}`, {
    method: 'DELETE',
  });
}

export async function exportConfig(): Promise<Record<string, unknown>> {
  const res = await adminFetch<{
    config?: Record<string, unknown>;
    ok?: boolean;
    message?: string;
  }>('/admin/config/export');
  if (!res.config) {
    throw new Error(res.message || 'Failed to export config');
  }
  return res.config;
}

export async function exportConfigToFile(
  filePath?: string
): Promise<{ ok: boolean; message?: string; path?: string }> {
  return adminFetch<{ ok: boolean; message?: string; path?: string }>(
    '/admin/config/export-file',
    {
      method: 'POST',
      body: JSON.stringify(filePath ? { path: filePath } : {}),
    }
  );
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
  const qs = category ? `?category=${encodeURIComponent(category)}` : '';
  return adminFetch<{ routing: RoutingEntry[] }>(`/admin/routing${qs}`);
}

export async function addRoutingModel(
  category: string,
  provider: ProviderId,
  model: string,
  configId: string,
  isPrimary?: boolean
): Promise<{ ok: boolean; routing: RoutingEntry[] }> {
  const qs = `?category=${encodeURIComponent(category)}`;
  return adminFetch<{ ok: boolean; routing: RoutingEntry[] }>(
    `/admin/routing/${encodeURIComponent(provider)}/${encodeURIComponent(model)}${qs}`,
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
  const qs = `?category=${encodeURIComponent(category)}`;
  return adminFetch<{ ok: boolean; routing: RoutingEntry[] }>(
    `/admin/routing/${encodeURIComponent(provider)}/${encodeURIComponent(model)}${qs}`,
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
  const sp = new URLSearchParams();
  sp.set('category', category);
  if (configId) sp.set('configId', configId);
  return adminFetch<{ ok: boolean; routing: RoutingEntry[] }>(
    `/admin/routing/${encodeURIComponent(provider)}/${encodeURIComponent(model)}?${sp.toString()}`,
    { method: 'DELETE' }
  );
}

export async function moveRoutingEntry(
  category: string,
  provider: ProviderId,
  model: string,
  configId: string,
  direction: 'up' | 'down'
): Promise<{ ok: boolean; routing: RoutingEntry[] }> {
  const sp = new URLSearchParams();
  sp.set('category', category);
  sp.set('configId', configId);
  sp.set('direction', direction);
  return adminFetch<{ ok: boolean; routing: RoutingEntry[] }>(
    `/admin/routing/${encodeURIComponent(provider)}/${encodeURIComponent(model)}/move?${sp.toString()}`,
    { method: 'PUT' }
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
  const sp = new URLSearchParams();
  sp.set('provider', provider);
  sp.set('configId', configId);
  return adminFetch<ProviderModelsResponse>(
    `/admin/provider-models?${sp.toString()}`
  );
}

export async function deleteProviderConfig(
  category: string,
  provider: ProviderId,
  configId: string
): Promise<{ ok: boolean }> {
  const qs = `?category=${encodeURIComponent(category)}`;
  return adminFetch<{ ok: boolean }>(
    `/admin/providers/${encodeURIComponent(provider)}/config/${encodeURIComponent(configId)}${qs}`,
    { method: 'DELETE' }
  );
}

export type TestConnectivityResponse = {
  ok: boolean;
  message?: string;
  apiFormat?: 'openai' | 'anthropic';
};

export async function testProviderConnectivity(
  provider: ProviderId,
  params: { apiKey?: string; baseUrl?: string; configId?: string }
): Promise<TestConnectivityResponse> {
  return adminFetch<TestConnectivityResponse>(
    `/admin/providers/${encodeURIComponent(provider)}/test-connectivity`,
    {
      method: 'POST',
      body: JSON.stringify(params),
    }
  );
}
