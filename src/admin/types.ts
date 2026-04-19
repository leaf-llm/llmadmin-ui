export type ProviderId = string;

export type ProviderStatus = 'connected' | 'disconnected' | 'unknown';

export type ProviderSummary = {
  provider: ProviderId;
  apiKeyMasked?: string;
  baseUrl?: string;
  status?: ProviderStatus;
  lastSyncedAt?: string;
  isPrimary?: boolean;
};

export type ProviderUpdateRequest = {
  apiKey?: string;
  baseUrl?: string;
  setAsPrimary?: boolean;
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
