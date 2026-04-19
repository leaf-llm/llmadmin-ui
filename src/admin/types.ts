export type ProviderId = string;

export type ProviderStatus = 'connected' | 'disconnected' | 'unknown';

export type ProviderSummary = {
  provider: ProviderId;
  apiKeyMasked?: string;
  baseUrl?: string;
  status?: ProviderStatus;
  lastSyncedAt?: string;
};

export type ProviderUpdateRequest = {
  apiKey?: string;
  baseUrl?: string;
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
